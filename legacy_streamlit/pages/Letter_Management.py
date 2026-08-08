import streamlit as st
import pandas as pd
import sqlite3
import os
from datetime import datetime
from core.letter_db import LetterDatabase

def render_letter_management():
    st.markdown('<h2 class="section-header">📋 Letter Management</h2>', unsafe_allow_html=True)
    
    # Initialize database - ensure we use the same instance as OCR processing
    if 'letter_db' not in st.session_state:
        try:
            st.session_state.letter_db = LetterDatabase()
            st.info("📋 Letter database initialized")
        except Exception as e:
            st.error(f"❌ Could not initialize letter database: {e}")
            return
    
    # Debug info
    st.sidebar.write(f"Database path: {st.session_state.letter_db.db_path}")
    
    # Get all letters
    try:
        letters = st.session_state.letter_db.get_all_letters()
        st.sidebar.write(f"Found {len(letters)} letters in database")
        
        # Optional: Sync prisoner_code (CPID) from authoritative DataFrame
        if 'df' in st.session_state and isinstance(st.session_state.df, pd.DataFrame) and not st.session_state.df.empty:
            if st.sidebar.button("🔄 Sync CPIDs from DataFrame"):
                try:
                    updated = st.session_state.letter_db.sync_prisoner_codes_from_df(st.session_state.df)
                    st.sidebar.success(f"Synchronized {updated} CPID value(s)")
                    st.rerun()
                except Exception as sync_err:
                    st.sidebar.error(f"CPID sync failed: {sync_err}")
    except Exception as e:
        st.error(f"❌ Could not retrieve letters: {e}")
        letters = []
    
    if letters:
        st.subheader(f"📊 Total Letters: {len(letters)}")
        
        # Create DataFrame for display
        letters_df = pd.DataFrame(letters)
        
        # Add an OCR preview column for quick visibility (first 120 chars, single line)
        if 'ocr_text' in letters_df.columns:
            letters_df['ocr_preview'] = (
                letters_df['ocr_text']
                .fillna('')
                .astype(str)
                .str.replace('\r', ' ', regex=False)
                .str.replace('\n', ' ', regex=False)
                .str.slice(0, 120)
            )
        else:
            letters_df['ocr_preview'] = ''
        
        # Display summary table with OCR preview and return address
        display_columns = [
            'letter_id',
            'prisoner_code',              # CPID
            'date_env_letter_scanned',    # 21Sep2025 format
            'processing_status',
            'ocr_preview',                 # NEW: quick glance at Vision OCR text
            'return_address'               # NEW: sender extracted by OCR (if available)
        ]
        available_columns = [col for col in display_columns if col in letters_df.columns]
        
        st.dataframe(letters_df[available_columns], use_container_width=True)
        
        # Letter selection and details
        st.markdown("---")
        st.subheader("📝 Letter Details")
        
        # Letter selection
        letter_options = [f"Letter #{letter['letter_id']} - {letter['prisoner_code']} ({letter['date_env_letter_scanned']})" 
                         for letter in letters]
        
        selected_option = st.selectbox(
            "Select letter to view/edit:",
            options=["None"] + letter_options
        )
        
        if selected_option != "None":
            # Extract letter ID from selection
            letter_id = int(selected_option.split("#")[1].split(" ")[0])
            letter_record = st.session_state.letter_db.get_letter_by_id(letter_id)
            
            if letter_record:
                render_letter_details_form(letter_record)
    
    else:
        st.info("No letters in database yet. Process some envelopes in the OCR Processing page!")
        st.markdown("### 🚀 Getting Started")
        st.markdown("1. Navigate to **OCR Processing** page")
        st.markdown("2. Upload or take a photo of an envelope")
        st.markdown("3. Process with OCR and select a prisoner")
        st.markdown("4. Click **Update Letter Exchange** to save to database")
        st.markdown("5. Return here to manage letter details")

def render_letter_details_form(letter_record):
    """Comprehensive letter details editing form with proper date handling"""
    
    st.subheader(f"📝 Letter #{letter_record['letter_id']} Details")
    
    # Helper function to parse our date format
    def parse_date_format(date_str):
        """Parse 21Sep2025 format to date object"""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, '%d%b%Y').date()
        except:
            return None
    
    # Use form to prevent constant reloads
    with st.form(key=f"letter_form_{letter_record['letter_id']}"):
        
        # Basic Info Section
        st.markdown("### 👤 Basic Information")
        col1, col2 = st.columns(2)
        with col1:
            st.text_input("Letter ID:", value=letter_record['letter_id'], disabled=True)
            st.text_input("Prisoner Code:", value=letter_record['prisoner_code'], disabled=True)
        with col2:
            st.text_input("Date Scanned:", value=letter_record.get('date_env_letter_scanned', ''), disabled=True)
            st.text_input("Return Address:", value=letter_record.get('return_address', ''), disabled=True)
        
        
        # Image Paths Section
        st.markdown("### 🖼️ Image Files")
        col1, col2 = st.columns(2)
        
        with col1:
            envelope_path = st.text_input(
                "Envelope image path:",
                value=letter_record.get('envelope_image_path', ''),
                help="Local drive, manually redacted, encrypted later"
            )
        
        with col2:
            letter_pages_path = st.text_input(
                "Letter pages image path (PDF):",
                value=letter_record.get('letter_pages_image_path', ''),
                help="Manually redacted, encrypted later, posted online"
            )
        
        # Date Tracking Section
        st.markdown("### 📅 Date Tracking")
        col1, col2 = st.columns(2)
        
        with col1:
            date_picked_up = st.date_input(
                "Date picked up from PO:",
                value=parse_date_format(letter_record.get('date_picked_up_po', '')),
                help="Manual entry - will be saved as 21Sep2025 format"
            )
            
            date_postmarked = st.date_input(
                "Date letter postmarked:",
                value=parse_date_format(letter_record.get('date_letter_postmarked', '')),
                help="OCR or manual entry/confirmation - will be saved as 21Sep2025 format"
            )
            
            date_began_response = st.date_input(
                "Date began writing response:",
                value=parse_date_format(letter_record.get('date_began_response', '')),
                help="Manual entry/confirmation - will be saved as 21Sep2025 format"
            )
        
        with col2:
            # Show scan date (read-only, already in correct format)
            st.text_input(
                "Date envelope/letter scanned:",
                value=letter_record.get('date_env_letter_scanned', ''),
                disabled=True,
                help="Auto-filled when scanned (21Sep2025 format)"
            )
            
            date_finished_response = st.date_input(
                "Date finished writing response:",
                value=parse_date_format(letter_record.get('date_finished_response', '')),
                help="Manual entry - will be saved as 21Sep2025 format"
            )
        
        # Processing Status
        st.markdown("### 📊 Processing Status")
        status_options = ['scanned', 'reviewed', 'response_started', 'response_completed', 'printed', 'mailed']
        current_status = letter_record.get('processing_status', 'scanned')
        
        # Handle legacy 'sent' status by converting to 'mailed'
        if current_status == 'sent':
            current_status = 'mailed'
        
        processing_status = st.selectbox(
            "Processing Status:",
            options=status_options,
            index=status_options.index(current_status) if current_status in status_options else 0,
            help="Track the current stage of letter processing"
        )
        
        # Status descriptions
        status_descriptions = {
            'scanned': '📥 Scanned - Envelope/letter scanned and OCR processed',
            'reviewed': '👀 Reviewed - Content reviewed and step work extracted',
            'response_started': '✍️ Response Started - Began writing response letter',
            'response_completed': '✅ Response Completed - Finished writing response',
            'printed': '🖨️ Printed - Response letter printed and ready to mail',
            'mailed': '📮 Mailed - Response letter mailed to prisoner'
        }
        st.info(status_descriptions.get(processing_status, ''))
        
        # Processor Notes
        st.markdown("### 📝 Notes")
        processor_notes = st.text_area(
            "Processor Notes:",
            value=letter_record.get('processor_notes', ''),
            height=100,
            help="Add any additional notes about this letter"
        )
        
        # OCR Text Preview
        if letter_record.get('ocr_text'):
            st.markdown("### 📄 OCR Text Preview")
            with st.expander("View OCR Text (Click to expand)"):
                st.text_area(
                    "Full OCR Text:",
                    value=letter_record['ocr_text'],
                    height=200,
                    disabled=True
                )
        
        # Form submission
        st.markdown("---")
        col1, col2 = st.columns(2)
        with col1:
            save_clicked = st.form_submit_button("💾 Save Changes", type="primary", use_container_width=True)
        with col2:
            cancel_clicked = st.form_submit_button("❌ Cancel", type="secondary", use_container_width=True)
        
        if save_clicked:
            # Update all fields with proper date formatting
            updates = {
                'step_work': step_work,
                'envelope_image_path': envelope_path,
                'letter_pages_image_path': letter_pages_path,
                'date_picked_up_po': date_picked_up,  # Will be formatted in update_letter_field
                'date_letter_postmarked': date_postmarked,
                'date_began_response': date_began_response,
                'date_finished_response': date_finished_response,
                'processing_status': processing_status,
                'processor_notes': processor_notes
            }
            
            # Update each field that changed
            changes_made = 0
            for field, new_value in updates.items():
                old_value = letter_record.get(field, '')
                if str(new_value) != str(old_value):
                    st.session_state.letter_db.update_letter_field(
                        letter_record['letter_id'], 
                        field, 
                        new_value, 
                        old_value
                    )
                    changes_made += 1
            
            if changes_made > 0:
                st.success(f"✅ Letter details updated successfully! ({changes_made} fields changed)")
                st.info("📅 All dates saved in 21Sep2025 format for easy reporting")
                st.balloons()
            else:
                st.info("ℹ️ No changes detected")
            
            st.rerun()
        
        if cancel_clicked:
            st.info("❌ Changes cancelled")
            st.rerun()

    # Previews (outside the form to allow download buttons)
    st.markdown("### 📷 Previews")
    preview_env_path = letter_record.get('envelope_image_path', '')
    preview_pdf_path = letter_record.get('letter_pages_image_path', '')
    colp1, colp2 = st.columns(2)
    with colp1:
        if preview_env_path:
            if os.path.exists(preview_env_path):
                try:
                    st.image(preview_env_path, caption="Envelope image", width=380)
                except Exception as e:
                    st.warning(f"Cannot display envelope image: {e}")
                try:
                    with open(preview_env_path, "rb") as f:
                        st.download_button(
                            label="📥 Download envelope image",
                            data=f,
                            file_name=os.path.basename(preview_env_path),
                            key=f"dl_env_{letter_record['letter_id']}"
                        )
                except Exception as e:
                    st.warning(f"Cannot offer envelope download: {e}")
            else:
                st.info("Envelope image not found on disk")
    with colp2:
        if preview_pdf_path:
            if os.path.exists(preview_pdf_path):
                try:
                    st.markdown(f"📄 Letter PDF: {os.path.basename(preview_pdf_path)}")
                except Exception:
                    pass
                try:
                    with open(preview_pdf_path, "rb") as f:
                        st.download_button(
                            label="📥 Download letter PDF",
                            data=f,
                            file_name=os.path.basename(preview_pdf_path),
                            key=f"dl_pdf_{letter_record['letter_id']}"
                        )
                except Exception as e:
                    st.warning(f"Cannot offer PDF download: {e}")
            else:
                st.info("Letter PDF not found on disk")

    # Danger Zone: Delete Letter
    st.markdown("---")
    st.subheader("🗑️ Danger Zone")
    st.caption("Deleting a letter will remove it from the database. This action cannot be undone.")
    col_del1, col_del2 = st.columns([2, 1])

    with col_del1:
        delete_files = st.checkbox("Also delete associated files from disk (envelope image and letter PDF if present)")
        confirm_text = st.text_input("Type DELETE to confirm:", value="", placeholder="DELETE", key=f"confirm_del_{letter_record['letter_id']}")

    with col_del2:
        if st.button("❌ Delete Letter", type="secondary", use_container_width=True, key=f"delete_letter_{letter_record['letter_id']}"):
            if confirm_text.strip().upper() == "DELETE":
                try:
                    ok = st.session_state.letter_db.delete_letter(letter_record['letter_id'], delete_files=delete_files)
                    if ok:
                        st.success(f"Letter #{letter_record['letter_id']} deleted.")
                        st.balloons()
                        st.rerun()
                    else:
                        st.warning("Delete operation did not complete.")
                except Exception as e:
                    st.error(f"Failed to delete letter: {e}")
            else:
                st.warning("Please type DELETE to confirm deletion.")

def render_reporting_section():
    """Basic reporting functionality"""
    st.markdown("---")
    st.subheader("📊 Reports")
    
    if 'letter_db' not in st.session_state:
        st.session_state.letter_db = LetterDatabase()
    
    # Processing status report
    if st.button("📈 Generate Processing Status Report"):
        report = st.session_state.letter_db.get_processing_report()
        
        if report:
            st.markdown("### Processing Status Summary")
            report_df = pd.DataFrame(report, columns=['Status', 'Count', 'Earliest Scan', 'Latest Scan'])
            st.dataframe(report_df, use_container_width=True)
            
            # Simple chart
            st.bar_chart(report_df.set_index('Status')['Count'])
        else:
            st.info("No data available for reporting yet")

# Main render function
def main():
    render_letter_management()
    render_reporting_section()

if __name__ == "__main__":
    main()
else:
    main()
