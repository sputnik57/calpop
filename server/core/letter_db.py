import sqlite3
import os
from datetime import datetime
from core.cipher import caesar_code
import json
import hashlib

class LetterDatabase:
    def __init__(self, db_path="letters.db"):
        # Resolve to absolute path under project root to ensure all pages use the same DB file
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if os.path.isabs(db_path):
            self.db_path = db_path
        else:
            self.db_path = os.path.join(project_root, db_path)
        self.init_database()
    
    @staticmethod
    def format_date(date_obj):
        """Convert date to 21Sep2025 format"""
        if isinstance(date_obj, str):
            # If already a string, try to parse it first
            try:
                date_obj = datetime.strptime(date_obj, '%Y-%m-%d')
            except:
                return date_obj  # Return as-is if can't parse
        
        if date_obj:
            return date_obj.strftime('%d%b%Y')
        return ''
    
    @staticmethod
    def format_datetime_to_date(datetime_obj):
        """Convert datetime to date in 21Sep2025 format"""
        if isinstance(datetime_obj, str):
            try:
                datetime_obj = datetime.strptime(datetime_obj, '%Y-%m-%d %H:%M:%S')
            except:
                return datetime_obj
        
        if datetime_obj:
            return datetime_obj.strftime('%d%b%Y')
        return ''
    
    def make_readable_cpid(self, raw_caesar, prisoner_record):
        """Convert raw Caesar cipher to clean CPID format like ABC123"""
        # Apply Caesar cipher to just the initials and take first 3 chars
        first_initial = prisoner_record['fName'][:1].upper() if prisoner_record['fName'] else 'X'
        last_initial = prisoner_record['lName'][:1].upper() if prisoner_record['lName'] else 'X'
        
        # Create a short string to encode: FirstLast + last 3 digits of CDCR
        cdcr_str = str(prisoner_record['CDCRno'])
        cdcr_suffix = cdcr_str[-3:] if len(cdcr_str) >= 3 else cdcr_str.zfill(3)
        
        # Combine for encoding
        to_encode = f"{first_initial}{last_initial}{cdcr_suffix}"
        
        # Apply Caesar cipher with shift=1, but keep only letters/numbers
        encoded_chars = []
        for char in to_encode:
            if char.isalpha():
                # Shift letters within A-Z range
                shifted = chr(((ord(char.upper()) - ord('A') + 1) % 26) + ord('A'))
                encoded_chars.append(shifted)
            elif char.isdigit():
                # Shift digits within 0-9 range
                shifted = str((int(char) + 1) % 10)
                encoded_chars.append(shifted)
            else:
                encoded_chars.append(char)
        
        # Take first 3 letters and 3 digits to make ABC123 format
        letters = ''.join([c for c in encoded_chars if c.isalpha()])[:3]
        numbers = ''.join([c for c in encoded_chars if c.isdigit()])[:3]
        
        # Pad if needed
        while len(letters) < 3:
            letters += 'X'
        while len(numbers) < 3:
            numbers += '0'
        
        cpid = f"{letters}{numbers}"
        return cpid
    
    def init_database(self):
        """Create letters table with standardized date format"""
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        cursor = conn.cursor()
        # Enable WAL for better concurrency across Streamlit pages
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS letters (
                letter_id INTEGER PRIMARY KEY AUTOINCREMENT,
                prisoner_idx INTEGER NOT NULL,
                prisoner_code TEXT NOT NULL,
                
                -- Step work (manually acquired from letter content)
                step_work TEXT,
                
                -- Image paths
                envelope_image_path TEXT,  -- manually redacted, encrypted later, local drive
                letter_pages_image_path TEXT,  -- PDF, manually redacted, encrypted later, posted online
                
                -- Standardized date tracking (21Sep2025 format)
                date_picked_up_po TEXT,  -- manually entered
                date_env_letter_scanned TEXT,  -- auto-filled when scanned
                date_letter_postmarked TEXT,  -- OCR or manual entry/confirmation
                date_began_response TEXT,  -- manual entry/confirmation
                date_finished_response TEXT,  -- manual entry
                
                -- OCR and processing data
                ocr_text TEXT,
                ocr_confidence REAL,
                return_address TEXT,
                processing_status TEXT DEFAULT 'scanned',
                processor_notes TEXT,
                raw_ocr_json_path TEXT,
                
                -- System timestamps (for audit purposes)
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create audit log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                letter_id INTEGER,
                field_changed TEXT,
                old_value TEXT,
                new_value TEXT,
                details TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_letter(self, prisoner_idx, prisoner_record, ocr_data, envelope_image_path, prisoner_code=None):
        """Add new letter record with initial scan data
        
        prisoner_code:
            - If provided, this value is stored as-is (authoritative CPID from the DataFrame)
            - If not provided, fallback to legacy generation to maintain backward compatibility
        """
        # Determine prisoner_code: prefer provided CPID from DataFrame
        if prisoner_code:
            prisoner_code_local = prisoner_code
        else:
            # Fallback to legacy generation to avoid breaking older calls
            raw_caesar = caesar_code(
                prisoner_record['fName'],
                prisoner_record['lName'], 
                str(prisoner_record['CDCRno'])
            )
            prisoner_code_local = self.make_readable_cpid(raw_caesar, prisoner_record)
        
        # Format scan date
        scan_date = self.format_datetime_to_date(datetime.now())
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO letters (
                prisoner_idx, prisoner_code, envelope_image_path,
                date_env_letter_scanned, ocr_text, return_address, processing_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            prisoner_idx,
            prisoner_code_local,
            envelope_image_path,
            scan_date,  # 21Sep2025 format
            ocr_data.get('full_text', ''),
            ocr_data.get('return_address', ''),
            'scanned'
        ))
        
        letter_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Log the action
        self.log_action('letter_added', letter_id, 'envelope_scanned', '', f'Letter envelope scanned on {scan_date}')
        
        return letter_id
    
    def update_letter_field(self, letter_id, field_name, new_value, old_value=None):
        """Update a specific field in letter record with date formatting"""
        
        # Format dates if it's a date field
        date_fields = [
            'date_picked_up_po', 'date_env_letter_scanned', 
    
            'date_letter_postmarked', 'date_began_response', 'date_finished_response'
        ]
        
        if field_name in date_fields and new_value:
            new_value = self.format_date(new_value)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Update the field
        cursor.execute(f'''
            UPDATE letters 
            SET {field_name} = ?, updated_at = ?
            WHERE letter_id = ?
        ''', (new_value, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), letter_id))
        
        conn.commit()
        conn.close()
        
        # Log the change
        self.log_action('field_updated', letter_id, field_name, old_value, new_value)
    
    def get_letter_by_id(self, letter_id):
        """Get complete letter record"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM letters WHERE letter_id = ?', (letter_id,))
            letter = cursor.fetchone()
            
            if letter:
                # Convert to dictionary for easier access
                columns = [desc[0] for desc in cursor.description]
                return dict(zip(columns, letter))
            
            return None
        finally:
            if conn:
                conn.close()
    
    def get_letters_for_prisoner(self, prisoner_idx):
        """Get all letters for a specific prisoner"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM letters WHERE prisoner_idx = ? 
            ORDER BY date_env_letter_scanned DESC
        ''', (prisoner_idx,))
        
        letters = cursor.fetchall()
        conn.close()
        return letters
    
    def get_all_letters(self):
        """Get all letters for management interface"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM letters 
            ORDER BY date_env_letter_scanned DESC
        ''')
        
        letters = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        conn.close()
        
        # Convert to list of dictionaries
        return [dict(zip(columns, letter)) for letter in letters]
    
    def sync_prisoner_codes_from_df(self, df):
        """Sync letters.prisoner_code from authoritative CPID in the provided DataFrame, using prisoner_idx."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT letter_id, prisoner_idx, prisoner_code FROM letters")
        rows = cursor.fetchall()
        updated = 0
        now_ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        for letter_id, prisoner_idx, old_code in rows:
            try:
                if prisoner_idx in df.index:
                    cpid_val = None
                    # Prefer CPID column; fallback to legacy 'code'
                    if 'CPID' in df.columns:
                        cpid_val = df.at[prisoner_idx, 'CPID']
                    if (cpid_val is None or str(cpid_val).lower() == 'nan' or str(cpid_val).strip() == '') and 'code' in df.columns:
                        cpid_val = df.at[prisoner_idx, 'code']
                    if cpid_val is not None and str(cpid_val).lower() != 'nan':
                        cpid_val = str(cpid_val)
                        if cpid_val != old_code:
                            cursor.execute(
                                "UPDATE letters SET prisoner_code = ?, updated_at = ? WHERE letter_id = ?",
                                (cpid_val, now_ts, letter_id)
                            )
                            updated += 1
            except Exception:
                # Skip any problematic rows; continue syncing others
                continue
        conn.commit()
        conn.close()
        return updated

    def delete_letter(self, letter_id: int, delete_files: bool = False) -> bool:
        """Delete a letter by ID. Optionally delete associated files from disk.
        
        Args:
            letter_id: The primary key of the letter to delete
            delete_files: If True, attempt to remove envelope/PDF files from disk
        
        Returns:
            bool: True if deletion completed (row removed), False otherwise
        """
        # First fetch any file paths before deleting the row
        envelope_path, pages_path = None, None
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT envelope_image_path, letter_pages_image_path FROM letters WHERE letter_id = ?", (letter_id,))
            row = cursor.fetchone()
            if row:
                envelope_path, pages_path = row[0], row[1]
        finally:
            try:
                conn.close()
            except Exception:
                pass

        # Delete the letter row
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM letters WHERE letter_id = ?", (letter_id,))
        conn.commit()
        conn.close()

        # Audit log (best effort)
        try:
            self.log_action('letter_deleted', letter_id, '', '', 'deleted')
        except Exception:
            pass

        # Optionally delete files from disk
        if delete_files:
            for p in (envelope_path, pages_path):
                if p and isinstance(p, str) and os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        # Ignore file deletion errors to avoid blocking the UI
                        pass

        return True

    def get_letters_by_date_range(self, start_date, end_date, date_field='date_env_letter_scanned'):
        """Get letters within date range for reporting"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Convert dates to our format for comparison
        start_formatted = self.format_date(start_date)
        end_formatted = self.format_date(end_date)
        
        cursor.execute(f'''
            SELECT * FROM letters 
            WHERE {date_field} BETWEEN ? AND ?
            ORDER BY {date_field}
        ''', (start_formatted, end_formatted))
        
        letters = cursor.fetchall()
        conn.close()
        return letters
    
    def get_processing_report(self):
        """Generate processing status report"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT 
                processing_status,
                COUNT(*) as count,
                MIN(date_env_letter_scanned) as earliest_scan,
                MAX(date_env_letter_scanned) as latest_scan
            FROM letters 
            WHERE date_env_letter_scanned IS NOT NULL
            GROUP BY processing_status
            ORDER BY processing_status
        ''')
        
        report = cursor.fetchall()
        conn.close()
        return report
    
    def log_action(self, action, letter_id=None, field_changed="", old_value="", new_value=""):
        """Enhanced audit log entry"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO audit_log (timestamp, action, letter_id, field_changed, old_value, new_value, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            action,
            letter_id,
            field_changed,
            str(old_value),
            str(new_value),
            f"Updated {field_changed}" if field_changed else action
        ))
        
        conn.commit()
        conn.close()
