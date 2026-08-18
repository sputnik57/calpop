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

                def clean(col: str) -> str:
                    # pandas represents a blank Excel cell as float NaN, not ''.
                    # str(nan) == 'nan' (and NaN is truthy in Python, so `or ''`
                    # doesn't catch it either) -- without pd.isna() here, every
                    # blank cell silently becomes the literal string "nan".
                    val = record.get(col, '')
                    return '' if pd.isna(val) else str(val).strip()

                resolved_cpid = clean(cpid_col)
                resolved_cdcr = clean('CDCRno')
                address = clean('address')
                city = clean('city')
                state = clean('state')
                zip_code = clean('zip')

                # Safety classification. Blank/'N' matches the roster's existing
                # convention (only flagged exceptions are marked unsafe) and maps
                # to "safe". Anything else unrecognized/garbled falls through to
                # "unsafe" as a fail-safe -- an envelope with the generic sender
                # address for a safe prisoner is a non-issue, but the reverse (an
                # identifying sender address reaching a prisoner for whom that's
                # dangerous) is not a mistake this can afford to make silently.
                unsafe_flag = clean('Unsafe?').upper()
                if unsafe_flag in ('N', 'NO', 'FALSE', '0', 'SAFE', ''):
                    safety_classification = 'safe'
                else:
                    # Covers 'Y'/'YES'/'TRUE'/'1'/'UNSAFE' and anything unrecognized.
                    safety_classification = 'unsafe'

                facility = clean('facility') or clean('Prison')

                return {
                    'cpid': resolved_cpid,
                    'cdcr_number': resolved_cdcr,
                    'first_name': clean('fName'),
                    'last_name': clean('lName'),
                    'address': address,
                    'city': city,
                    'state': state,
                    'zip': zip_code,
                    'full_address': f"{address} {city} {state} {zip_code}".strip(),
                    'housing': clean('housing'),
                    'facility': facility,
                    'safety_classification': safety_classification,
                    'sponsor_name': clean('Sponsor'),
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
            
    @staticmethod
    def _extract_prisoner_row(row) -> Optional[Dict[str, Any]]:
        """
        Normalize one Excel row into the shape Postgres's Prisoner table
        expects. Returns None if the row has no CPID. Shared by
        sync_with_postgres_prisoners and diff_with_postgres_prisoners so
        both use identical field mapping/safety-classification logic.
        """
        cpid = str(row.get('CPID') or row.get('code') or '').strip()
        if not cpid:
            return None

        def field(col: str) -> Optional[str]:
            val = row.get(col)
            return str(val).strip() if pd.notna(val) else None

        # Safety classification: same fail-safe as resolve_name_from_cpid --
        # blank/'N' -> safe, anything else (including unrecognized) -> unsafe.
        unsafe_flag = (field('Unsafe?') or '').strip().upper()
        safety_classification = 'safe' if unsafe_flag in ('N', 'NO', 'FALSE', '0', 'SAFE', '') else 'unsafe'

        def int_field(col: str) -> Optional[int]:
            val = row.get(col)
            if pd.isna(val):
                return None
            try:
                return int(val)
            except (TypeError, ValueError):
                return None

        # 'housing' (cell/unit, e.g. "E25-B204-1L") and 'Prison' (the actual
        # facility name) are different columns in the roster -- previously
        # conflated (housing was being written into the 'facility' Postgres
        # column, and housing wasn't synced at all). Mapped separately here.
        return {
            'cpid': cpid,
            'first_name': field('fName'),
            'last_name': field('lName'),
            'facility': field('facility') or field('Prison'),
            'housing': field('housing'),
            'address': field('address'),
            'city': field('city'),
            'state': field('state'),
            'zip': field('zip'),
            'cdcr_number': field('CDCRno'),
            'safety_classification': safety_classification,
            # Authoritative sponsor assignment, straight from the roster.
            # "Course" (project owner's sentinel, not a real name) and blank
            # both mean "no external sponsor" for Envelope Mgt routing.
            'sponsor_name': field('Sponsor'),
            # Added 18Aug2026 -- these roster columns were being read into
            # the in-memory dataframe for dashboard stats but never actually
            # persisted to Postgres. 'Intake #' is the roster's column for
            # an untitled sequential "which contact number was this person"
            # column; falls back to the legacy 'Count' header until sheets
            # in the wild are renamed.
            'intake_number': int_field('Intake #') if 'Intake #' in row.index else int_field('Count'),
            'stage': int_field('Stage'),
            'cdcr_db_verified': field('CDCR db verif'),
            'contract_status': field('contract'),
            'date_of_contract': field('Date of contract'),
            'needs_green_book': field('Needs Green book?'),
            'language': field('language'),
            'review_notes': field('Review notes'),
            'date_sponsor_assigned': field('Date Sponsor assigned'),
            'letter_exchange_count': int_field('letter exchange (received only)'),
            'step_received_count': int_field('Step (received only)'),
            'bph_date': field('BPH DATE'),
        }

    def diff_with_postgres_prisoners(self, db: Session) -> Dict[str, Any]:
        """
        Compare this manager's loaded Excel data against current Postgres
        state, per prisoner (matched by CPID), without writing anything.
        Postgres is the source of truth as of 09Aug2026 -- this exists so an
        upload can be reviewed before it's allowed to overwrite anything,
        rather than blindly upserting every row in the file.
        """
        if not self.is_loaded():
            return {"new": [], "changed": [], "unchanged_count": 0, "missing_from_file": []}

        file_cpids: set = set()
        new_records = []
        changed_records = []
        unchanged_count = 0
        compare_fields = [
            'first_name', 'last_name', 'facility', 'housing',
            'address', 'city', 'state', 'zip', 'cdcr_number', 'safety_classification',
            'intake_number', 'stage', 'cdcr_db_verified', 'contract_status',
            'date_of_contract', 'needs_green_book', 'language', 'review_notes',
            'date_sponsor_assigned', 'letter_exchange_count', 'step_received_count',
            'bph_date',
        ]

        for _, row in self.df.iterrows():
            incoming = self._extract_prisoner_row(row)
            if not incoming:
                continue
            cpid = incoming['cpid']
            file_cpids.add(cpid)

            existing = db.query(Prisoner).filter(Prisoner.cpid == cpid).first()
            if not existing:
                new_records.append(incoming)
                continue

            diffs = {}
            for f in compare_fields:
                old_val = getattr(existing, f)
                new_val = incoming[f]
                if (old_val or None) != (new_val or None):
                    diffs[f] = {"old": old_val, "new": new_val}

            if diffs:
                changed_records.append({"cpid": cpid, "changes": diffs})
            else:
                unchanged_count += 1

        all_db_cpids = {p.cpid for p in db.query(Prisoner.cpid).all()}
        missing_from_file = sorted(all_db_cpids - file_cpids)

        return {
            "new": new_records,
            "changed": changed_records,
            "unchanged_count": unchanged_count,
            "missing_from_file": missing_from_file,
        }

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
                prisoner_data = self._extract_prisoner_row(row)
                if not prisoner_data:
                    continue

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
