import pandas as pd
import os
from typing import Optional, Dict, Any, List
from fastapi import HTTPException
import logging
from sqlalchemy.orm import Session
from db.models import Prisoner

logger = logging.getLogger(__name__)

class ExcelMapManager:
    """
    Manages the Excel file containing prisoner data for secure ID <-> Name resolution.
    This is the core of the "Secure Vault" - handles sensitive data that never leaves the backend.
    """
    
    def __init__(self, excel_file_path: Optional[str] = None):
        self.df: Optional[pd.DataFrame] = None
        self.excel_file_path = excel_file_path
        self.required_columns = ['fName', 'lName', 'CDCRno']
        self.preferred_columns = ['CPID', 'Sponsor', 'Stage', 'housing', 'address', 'city', 'state', 'zip']
        
        if excel_file_path and os.path.exists(excel_file_path):
            self.load_excel(excel_file_path)
    
    def load_excel(self, file_path: str) -> bool:
        """
        Load Excel file and validate required columns.
        Returns True if successful, False otherwise.
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Excel file not found: {file_path}")
            
            # Load the Excel file
            self.df = pd.read_excel(file_path)
            logger.info(f"Loaded Excel file: {file_path} with {len(self.df)} records")
            
            # Validate required columns
            missing_columns = [col for col in self.required_columns if col not in self.df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {missing_columns}")
            
            # Ensure Stage is numeric for filtering
            if 'Stage' in self.df.columns:
                self.df['Stage'] = pd.to_numeric(self.df['Stage'], errors='coerce')
            
            # Store file path for future reference
            self.excel_file_path = file_path
            
            logger.info(f"Excel validation successful. Columns: {list(self.df.columns)}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load Excel file {file_path}: {str(e)}")
            self.df = None
            raise HTTPException(status_code=400, detail=f"Failed to load Excel file: {str(e)}")
    
    def load_excel_from_bytes(self, file_bytes: bytes, filename: str) -> bool:
        """
        Load Excel file from bytes (for file uploads).
        """
        try:
            import io
            self.df = pd.read_excel(io.BytesIO(file_bytes))
            logger.info(f"Loaded Excel from upload: {filename} with {len(self.df)} records")
            
            # Validate required columns
            missing_columns = [col for col in self.required_columns if col not in self.df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns: {missing_columns}")
            
            # Ensure Stage is numeric for filtering
            if 'Stage' in self.df.columns:
                self.df['Stage'] = pd.to_numeric(self.df['Stage'], errors='coerce')
            
            logger.info(f"Excel upload validation successful. Columns: {list(self.df.columns)}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load Excel from bytes: {str(e)}")
            self.df = None
            raise HTTPException(status_code=400, detail=f"Failed to process Excel file: {str(e)}")
    
    def is_loaded(self) -> bool:
        """Check if Excel data is loaded and ready."""
        return self.df is not None and not self.df.empty
    
    def get_prisoner_by_idx(self, prisoner_idx: int) -> Optional[Dict[str, Any]]:
        """
        Get full prisoner record by DataFrame index.
        Used for resolving prisoner_idx from letters.db to full record.
        """
        if not self.is_loaded():
            return None
        
        try:
            if prisoner_idx in self.df.index:
                record = self.df.loc[prisoner_idx].to_dict()
                # Convert any NaN values to None for JSON serialization
                return {k: (None if pd.isna(v) else v) for k, v in record.items()}
            return None
        except Exception as e:
            logger.error(f"Error getting prisoner by idx {prisoner_idx}: {str(e)}")
            return None
    
    def get_prisoner_by_cpid(self, cpid: str) -> Optional[Dict[str, Any]]:
        """
        Get prisoner record by encrypted CPID.
        Returns anonymized data safe for frontend consumption.
        """
        if not self.is_loaded():
            return None
        
        try:
            # Try CPID column first, fallback to legacy 'code' column
            cpid_column = None
            if 'CPID' in self.df.columns:
                cpid_column = 'CPID'
            elif 'code' in self.df.columns:
                cpid_column = 'code'
            else:
                logger.warning("No CPID or code column found in Excel data")
                return None
            
            matches = self.df[self.df[cpid_column] == cpid]
            if not matches.empty:
                record = matches.iloc[0].to_dict()
                
                # Return anonymized version - no real names
                anonymized = {
                    'cpid': cpid,
                    'housing': record.get('housing'),
                    'city': record.get('city'),
                    'state': record.get('state'),
                    'zip': record.get('zip'),
                    'sponsor': record.get('Sponsor'),
                    'stage': record.get('Stage'),
                    'language': record.get('language'),
                    # Do NOT include fName, lName, CDCRno, address
                }
                
                # Convert NaN to None
                return {k: (None if pd.isna(v) else v) for k, v in anonymized.items()}
            
            return None
        except Exception as e:
            logger.error(f"Error getting prisoner by CPID {cpid}: {str(e)}")
            return None
    
    def resolve_name_from_cpid(self, cpid: str) -> Optional[Dict[str, str]]:
        """
        ADMIN/SPONSOR: Resolve full identity from any ID (CPID or CDCR#).
        Handles prefix-stripping (e.g. 'X99999' -> '62173') for numeric matching.
        """
        if not self.is_loaded():
            return None
        
        try:
            # 1. Identify key columns
            cpid_col = 'CPID' if 'CPID' in self.df.columns else 'code'
            cdcr_col = 'CDCRno' if 'CDCRno' in self.df.columns else None
            
            # 2. Prepare search variants
            raw_id = str(cpid).strip().upper()
            numeric_id = ''.join(filter(str.isdigit, raw_id))
            
            # 3. Search CPID column (Exact Match)
            matches = self.df[self.df[cpid_col].astype(str).str.upper() == raw_id]
            
            # 4. Fallback: Search CDCR column (Exact or Numeric Match)
            if matches.empty and cdcr_col:
                # Try exact string match first
                matches = self.df[self.df[cdcr_col].astype(str).str.upper() == raw_id]
                
                # If not found, try matching just the numbers (e.g. X99999 vs 62173)
                if matches.empty and numeric_id:
                    # Filter out non-numeric entries in the column before comparison to avoid float conversion errors
                    col_data = self.df[cdcr_col].astype(str)
                    matches = self.df[col_data.apply(lambda x: ''.join(filter(str.isdigit, x))) == numeric_id]
            
            if not matches.empty:
                record = matches.iloc[0]
                resolved_cpid = str(record.get(cpid_col, ''))
                resolved_cdcr = str(record.get('CDCRno', ''))
                
                # If they are different, we have a successful link!
                return {
                    'cpid': resolved_cpid,
                    'cdcr_number': resolved_cdcr,
                    'first_name': str(record.get('fName', '')),
                    'last_name': str(record.get('lName', '')),
                    'full_address': f"{record.get('address', '')} {record.get('city', '')} {record.get('state', '')} {record.get('zip', '')}".strip(),
                    'housing': str(record.get('housing', '')),
                    'facility': str(record.get('facility', record.get('Prison', '')))
                }
            
            return None
        except Exception as e:
            logger.error(f"Error resolving ID {cpid}: {str(e)}")
            return None
    
    def get_sponsorship_stats(self) -> Dict[str, Any]:
        """
        Calculate program statistics.
        Active sponsees = Stage 12, Unique sponsors = Stage 2-89.
        """
        if not self.is_loaded():
            return {
                "active_sponsors_count": 0,
                "active_sponsees_count": 0,
                "unique_sponsors_count": 0,
                "sponsors_breakdown": []
            }
        
        try:
            # Filter active sponsees (Stage 12)
            active_df = self.df[self.df['Stage'] == 12]
            active_sponsors_count = active_df['Sponsor'].nunique()
            active_sponsees_count = len(active_df)
            
            # Filter for unique sponsors (Stage 2-89)
            program_df = self.df[(self.df['Stage'] >= 2) & (self.df['Stage'] <= 89)]
            unique_sponsors_count = program_df['Sponsor'].nunique()
            
            # Get sponsor breakdown for active sponsees
            sponsor_counts = active_df['Sponsor'].value_counts()
            sponsors_breakdown = [
                {"name": sponsor, "count": int(count)}
                for sponsor, count in sponsor_counts.items()
                if pd.notna(sponsor)
            ]
            
            return {
                "active_sponsors_count": active_sponsors_count,
                "active_sponsees_count": active_sponsees_count,
                "unique_sponsors_count": unique_sponsors_count,
                "total_prisoners": len(self.df),
                "sponsors_breakdown": sponsors_breakdown
            }
            
        except Exception as e:
            logger.error(f"Error calculating program stats: {str(e)}")
            return {
                "active_sponsors_count": 0,
                "active_sponsees_count": 0,
                "unique_sponsors_count": 0,
                "sponsors_breakdown": []
            }
    
    def get_prisoners_by_sponsor(self, sponsor_name: str, active_only: bool = True) -> List[Dict[str, Any]]:
        """
        Get all prisoners for a specific sponsor.
        Returns anonymized data safe for frontend.
        """
        if not self.is_loaded():
            return []
        
        try:
            # Filter by sponsor
            sponsor_df = self.df[self.df['Sponsor'] == sponsor_name]
            
            # Filter by active status if requested
            if active_only:
                sponsor_df = sponsor_df[sponsor_df['Stage'] == 12]
            
            # Return anonymized records
            results = []
            for _, record in sponsor_df.iterrows():
                cpid = record.get('CPID') or record.get('code', '')
                results.append({
                    'cpid': cpid,
                    'housing': record.get('housing'),
                    'city': record.get('city'),
                    'state': record.get('state'),
                    'stage': record.get('Stage'),
                    'language': record.get('language')
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting prisoners for sponsor {sponsor_name}: {str(e)}")
            return []
    
    def get_all_sponsors(self, active_only: bool = True) -> List[str]:
        """Get list of all sponsors."""
        if not self.is_loaded():
            return []
        
        try:
            df = self.df
            if active_only:
                df = df[df['Stage'] == 12]
            
            sponsors = df['Sponsor'].dropna().unique().tolist()
            return sorted(sponsors)
            
        except Exception as e:
            logger.error(f"Error getting sponsors list: {str(e)}")
            return []
    
    def sync_with_letter_db(self, letter_db):
        """
        Sync prisoner codes in letters.db with authoritative CPID from Excel.
        This ensures the letter database uses the correct CPIDs from the Excel file.
        """
        if not self.is_loaded():
            logger.warning("Cannot sync with letter DB - Excel data not loaded")
            return 0
        
        try:
            updated_count = letter_db.sync_prisoner_codes_from_df(self.df)
            logger.info(f"Synced {updated_count} prisoner codes with letter database")
            return updated_count
        except Exception as e:
            logger.error(f"Error syncing with letter DB: {str(e)}")
            return 0
            
    def sync_with_postgres_prisoners(self, db: Session) -> int:
        """
        Sync Excel prisoners with the Postgres database.
        Returns the number of records upserted.
        """
        if not self.is_loaded():
            logger.warning("Cannot sync with Postgres - Excel data not loaded")
            return 0
            
        try:
            from sqlalchemy.dialects.postgresql import insert
            
            records_count = 0
            # Iterate through the dataframe and upsert each prisoner
            for _, row in self.df.iterrows():
                cpid = str(row.get('CPID') or row.get('code') or '').strip()
                if not cpid:
                    continue
                    
                # Prepare data for upsert
                prisoner_data = {
                    'cpid': cpid,
                    'first_name': str(row.get('fName', '')) if pd.notna(row.get('fName')) else None,
                    'last_name': str(row.get('lName', '')) if pd.notna(row.get('lName')) else None,
                    'facility': str(row.get('housing', '')) if pd.notna(row.get('housing')) else None,
                    'address': str(row.get('address', '')) if pd.notna(row.get('address')) else None,
                    'city': str(row.get('city', '')) if pd.notna(row.get('city')) else None,
                    'state': str(row.get('state', '')) if pd.notna(row.get('state')) else None,
                    'zip': str(row.get('zip', '')) if pd.notna(row.get('zip')) else None,
                }
                
                stmt = insert(Prisoner).values(**prisoner_data)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['cpid'],
                    set_=prisoner_data
                )
                db.execute(stmt)
                records_count += 1
                
            db.commit()
            logger.info(f"Successfully synced {records_count} prisoners to Postgres")
            return records_count
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to sync with Postgres: {str(e)}")
            return 0
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary information about the loaded Excel data."""
        if not self.is_loaded():
            return {"loaded": False}
        
        return {
            "loaded": True,
            "total_records": len(self.df),
            "columns": list(self.df.columns),
            "active_sponsees": len(self.df[self.df['Stage'] == 12]) if 'Stage' in self.df.columns else 0,
            "unique_sponsors": self.df['Sponsor'].nunique() if 'Sponsor' in self.df.columns else 0,
            "file_path": self.excel_file_path
        }
