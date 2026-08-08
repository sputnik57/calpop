# pdf_envelopes_app.py
import streamlit as st
import pandas as pd
import cairo
from io import BytesIO
import time
import os

# Function defining PDF paper size, layout and text format
INCHES_TO_POINTS = 72

def write_envelopes_buffer(from_addr, to_addrs):
    """Write envelopes to a BytesIO buffer."""
    buffer = BytesIO()
    surface = cairo.PDFSurface(buffer,
                               9.5 * INCHES_TO_POINTS,
                               4.13 * INCHES_TO_POINTS)
    cr = cairo.Context(surface)
    cr.select_font_face('serif')

    MARGIN = 0.30
    for to_addr in to_addrs:
        # Write return address
        for i, line in enumerate(from_addr):
            cr.move_to(MARGIN * INCHES_TO_POINTS,
                       (MARGIN * INCHES_TO_POINTS) + 12 + (12 * i))
            cr.show_text(line)

        # Write recipient address
        for i, line in enumerate(to_addr):
            cr.move_to(4.5 * INCHES_TO_POINTS,
                       (2.25 * INCHES_TO_POINTS) + 30 + (12 * i))
            cr.show_text(line)
        cr.show_page()

    surface.flush()
    surface.finish()
    buffer.seek(0)
    return buffer

def process_prisoner_data(df, selected_records):
    """Process prisoner data and generate address lists."""
    # Use only selected records
    sponsList = selected_records.copy()
    
    # Reduce dataframe to relevant columns only
    sponsList2 = sponsList[['fName', 'lName', 'Unsafe?', 'CDCRno', 'housing', 'address', 'city', 'state', 'zip']].copy()
    
    # Merge name and location columns
    sponsList2['Name'] = sponsList2[['fName', 'lName', 'CDCRno']].astype(str).agg(' '.join, axis=1)
    sponsList2['location'] = sponsList2[['city', 'state']].astype(str).agg(' '.join, axis=1) + ' ' + sponsList2['zip'].astype(str)
    
    # Remove redundant columns that were merged
    sponsList2 = sponsList2[['Name', 'housing', 'address', 'location', 'Unsafe?']]
    
    # Separate safe and unsafe environments
    KEYWORD = "unsafe"
    unsafe_env = sponsList2['Unsafe?'].str.casefold().isin([KEYWORD])
    sponsList2_unsafe = sponsList2[unsafe_env]
    sponsList2_safe = sponsList2[~unsafe_env]
    
    # Handle empty data cases
    if len(sponsList2_unsafe) > 0:
        sponsList2_unsafe.fillna(' ', inplace=True)
    sponsList2_safe.fillna(' ', inplace=True)
    
    # Prepare envelope lists
    sponsList3_unsafe = []
    if len(sponsList2_unsafe) > 0:
        sponsList3_unsafe = sponsList2_unsafe.drop(['Unsafe?'], axis=1)
        sponsList3_unsafe = sponsList3_unsafe.values.tolist()
    
    sponsList3_safe = sponsList2_safe.drop(['Unsafe?'], axis=1)
    sponsList3_safe = sponsList3_safe.values.tolist()
    
    return sponsList3_safe, sponsList3_unsafe

def search_and_select_prisoners(df):
    """Search-as-you-typed prisoner selection system with proper multi-selection tracking"""
    
    st.subheader("2. Search and Select Prisoners")
    
    # Check for OCR queue and display it first
    if 'envelope_queue' in st.session_state and st.session_state.envelope_queue:
        st.markdown("#### 📋 OCR Processing Queue")
        st.info(f"Found {len(st.session_state.envelope_queue)} prisoners from OCR processing session")
        
        # Display OCR queue
        for i, entry in enumerate(st.session_state.envelope_queue, 1):
            st.write(f"{i}. **{entry['name']}** (CDCR #{entry['cdcr_no']}) - Added: {entry['timestamp']}")
        
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("✅ Add OCR Queue to Selection", type="primary"):
                # Add OCR queue prisoners to selection
                for entry in st.session_state.envelope_queue:
                    st.session_state.all_selected_indices.add(entry['prisoner_idx'])
                st.success(f"Added {len(st.session_state.envelope_queue)} prisoners from OCR queue!")
                st.rerun()
        
        with col2:
            if st.button("🗑️ Clear OCR Queue"):
                st.session_state.envelope_queue = []
                st.success("OCR queue cleared!")
                st.rerun()
        
        with col3:
            if st.button("📋 Use OCR Queue Only", type="secondary"):
                # Clear existing selections and use only OCR queue
                st.session_state.all_selected_indices = {entry['prisoner_idx'] for entry in st.session_state.envelope_queue}
                st.success("Using OCR queue only!")
                st.rerun()
        
        st.markdown("---")
    
    # Initialize session state for selections
    if 'all_selected_indices' not in st.session_state:
        st.session_state.all_selected_indices = set()
    
    # Create a better display name for search - convert all to string first
    df['search_display'] = (
        df['lName'].fillna('').astype(str) + ", " + 
        df['fName'].fillna('').astype(str) + 
        " (" + df['housing'].fillna('').astype(str) + ")" +
        " [" + df['CDCRno'].fillna('No ID').astype(str) + "]"
    )
    
    # Show all currently selected prisoners
    if st.session_state.all_selected_indices:
        st.markdown("#### ✅ Currently Selected Prisoners")
        currently_selected_df = df[df.index.isin(st.session_state.all_selected_indices)]
        # Show requested columns: fName, lName, CDCRno, housing, city, state, zip, Unsafe?
        display_columns = ['fName', 'lName', 'CDCRno', 'housing', 'city', 'state', 'zip', 'Unsafe?']
        # Filter to only include columns that exist in the dataframe
        existing_columns = [col for col in display_columns if col in currently_selected_df.columns]
        st.dataframe(currently_selected_df[existing_columns])
        st.markdown(f"**Total selected: {len(st.session_state.all_selected_indices)}**")
        
        # Add clear selections button
        if st.button("🗑️ Clear All Selections", key="clear_selections"):
            st.session_state.all_selected_indices.clear()
            if 'selected_records' in st.session_state:
                del st.session_state.selected_records
            st.success("All selections cleared!")
            st.rerun()
        
        st.markdown("---")
    
    # Clear instructions for search
    st.markdown("#### 🔍 Search for Prisoners")
    st.markdown("Type a last name, first name, ID number, or housing to find prisoners:")
    
    # Prominent search box
    search_term = st.text_input(
        "Enter search term:",
        placeholder="e.g., Smith, John, A12345, Facility A",
        key="prisoner_search"
    )
    
    # Filter based on search term
    if search_term and len(search_term) >= 2:  # Only search if 2+ characters
        search_term_lower = search_term.lower()
        
        # Build search conditions - check if columns exist before using them
        conditions = [
            df['lName'].astype(str).str.lower().str.contains(search_term_lower, na=False),
            df['fName'].astype(str).str.lower().str.contains(search_term_lower, na=False),
            df['CDCRno'].astype(str).str.lower().str.contains(search_term_lower, na=False),
            df['housing'].astype(str).str.lower().str.contains(search_term_lower, na=False)
        ]
        
        # Only include folderCode in search if it exists
        if 'folderCode' in df.columns:
            conditions.append(df['folderCode'].astype(str).str.lower().str.contains(search_term_lower, na=False))
        
        # Combine all conditions
        combined_condition = conditions[0]
        for condition in conditions[1:]:
            combined_condition = combined_condition | condition
            
        filtered_df = df[combined_condition]
        st.info(f"Found {len(filtered_df)} matching prisoners")
    elif search_term and len(search_term) < 2:
        st.info("Please enter at least 2 characters to search...")
        filtered_df = pd.DataFrame()
    else:
        # Show instruction when no search
        st.info("👆 Start typing in the search box above to find prisoners")
        st.markdown("**Example searches:**")
        st.markdown("- Last name: `Smith`")
        st.markdown("- First name: `John`") 
        st.markdown("- ID number: `A12345`")
        st.markdown("- Housing: `Facility A`")
        filtered_df = pd.DataFrame()
    
    # Show matching prisoners for selection
    if not filtered_df.empty and len(filtered_df) > 0:
        st.markdown("#### 📋 Select Prisoners (Current Search)")
        
        # Track which indices are selected in current search
        current_search_selections = set()
        
        for idx, row in filtered_df.iterrows():
            # Unique key for each checkbox
            checkbox_key = f"select_{idx}"
            
            # Create a clear display for each prisoner - guard missing columns
            lname = row.get('lName', '')
            fname = row.get('fName', '')
            housing_val = row.get('housing', '')
            cdcr_val = row.get('CDCRno', 'No ID')
            prisoner_display = f"**{lname}, {fname}** - {housing_val} [{cdcr_val}]"
            
            # Show checkbox with prisoner info
            is_selected = st.checkbox(
                prisoner_display,
                key=checkbox_key,
                value=(idx in st.session_state.all_selected_indices)
            )
            
            # Track current selections
            if is_selected:
                current_search_selections.add(idx)
        
        # Update all selections: Remove indices from current search, then add back selected ones
        # First, remove any indices that were in the current search results
        current_search_indices = set(filtered_df.index)
        st.session_state.all_selected_indices = st.session_state.all_selected_indices - current_search_indices
        
        # Then add back the ones that are currently selected
        st.session_state.all_selected_indices.update(current_search_selections)

        # Allow adding the current selection to the unified Print Queue
        if st.session_state.all_selected_indices:
            if 'envelope_queue' not in st.session_state:
                st.session_state.envelope_queue = []
            if st.button("➕ Add Selected to Print Queue", key="add_selected_to_queue"):
                import time as _time
                added = 0
                df_selected = df[df.index.isin(st.session_state.all_selected_indices)]
                for idx, row in df_selected.iterrows():
                    exists = any(e.get('prisoner_idx') == idx for e in st.session_state.envelope_queue)
                    if not exists:
                        st.session_state.envelope_queue.append({
                            'prisoner_idx': idx,
                            'name': f"{row.get('fName','')} {row.get('lName','')}",
                            'cdcr_no': row.get('CDCRno',''),
                            'housing': row.get('housing',''),
                            'address': row.get('address',''),
                            'timestamp': _time.strftime("%Y-%m-%d %H:%M"),
                            'source': 'Print Envelopes Search'
                        })
                        added += 1
                st.success(f"Added {added} to print queue")
        
        # Get ALL selected records (not just current search)
        if st.session_state.all_selected_indices:
            selected_records = df[df.index.isin(st.session_state.all_selected_indices)]
            
            # Save to session state
            st.session_state.selected_records = selected_records
            return selected_records
        else:
            # Return previously selected if they exist
            if 'selected_records' in st.session_state:
                return st.session_state.selected_records
    else:
        # No matches or no search yet - show existing selections
        if 'selected_records' in st.session_state and st.session_state.all_selected_indices:
            return st.session_state.selected_records
    
    return pd.DataFrame()

def load_data_page():
    # Use the dataframe loaded in Home.py
    if "df" in st.session_state:
        df = st.session_state.df
        st.session_state.pris_file = df
        st.session_state.data_loaded = True
        
        # Show data info without PII
        st.subheader(f"1. Load Data")
        st.write(f"Loaded data file: {st.session_state.get('file_name', 'N/A')}")
        st.write(f"Total records: {len(df)}")
        st.write(f"(Non-PII Information Only)")

        # Show only non-PII information
        # st.markdown("### Data Preview (Non-PII Information Only)")
        # st.write("Data successfully loaded and ready for envelope generation.")
        
        # # Show column names as a reference (without showing actual data)
        # st.markdown("#### Available Columns:")
        # st.write(", ".join(df.columns.tolist()))
        
        # Show saved PDFs
        pdf_dir = "saved_pdfs"
        if os.path.exists(pdf_dir):
            saved_pdfs = [f for f in os.listdir(pdf_dir) if f.endswith('.pdf')]
            if saved_pdfs:
                st.markdown("### 📁 Saved PDF envelope files")
                # Sort by modification time, newest first
                saved_pdfs.sort(key=lambda x: os.path.getmtime(os.path.join(pdf_dir, x)), reverse=True)
                
                # Show last 10 saved PDFs
                for pdf_file in saved_pdfs[:10]:
                    file_path = os.path.join(pdf_dir, pdf_file)
                    file_size = os.path.getsize(file_path)
                    file_time = time.ctime(os.path.getmtime(file_path))
                    
                    col1, col2, col3 = st.columns([3, 1, 1])
                    col1.markdown(f"📄 {pdf_file}")
                    col2.markdown(f"💾 {file_size//1024} KB")
                    col3.markdown(f"🕒 {file_time.split()[1]} {file_time.split()[2]}")
                    
                    # Add download button for each saved PDF
                    with open(file_path, "rb") as f:
                        st.download_button(
                            label="📥 Download",
                            data=f,
                            file_name=pdf_file,
                            mime="application/pdf",
                            key=f"download_{pdf_file}"
                        )
                if len(saved_pdfs) > 10:
                    st.info(f"Showing 10 of {len(saved_pdfs)} saved PDFs. Check the {pdf_dir} directory for more.")
        
        # Automatically clear selection state when loading new data
        # This ensures we start with a clean slate for prisoner selection
        if st.session_state.get('prisoners_selected', False) or st.session_state.get('selected_prisoners') is not None:
            if st.button("🔄 Clear Previous Selections"):
                # Clear selection-related session state
                keys_to_clear = [
                    'selected_prisoners', 'all_selected_indices', 'selected_records', 
                    'prisoners_selected'
                ]
                for key in keys_to_clear:
                    if key in st.session_state:
                        del st.session_state[key]
                st.success("Previous selections cleared! You can now select new prisoners.")
                st.rerun()
    else:
        st.warning("⚠️ No data loaded. Please upload a file on the Home page.")
        st.info("Navigate to the Home page to load your prisoner data first.")
        

   
def select_prisoners_page():
    """Page for selecting prisoners from cached data"""
    if 'data_loaded' not in st.session_state or not st.session_state.data_loaded:
        st.warning("Please load prisoner data first!")
        st.info("Navigate to the 'Load Data' page to upload your Excel file.")
        return
    
    st.subheader(f"Loaded Data: {st.session_state.get('file_name', 'Unknown')}")
    
    # Show data info
    pris_file = st.session_state.pris_file
    st.write(f"Total prisoners in database: {len(pris_file)}")
    
    # Use search-as-you-type selector
    selected_prisoners = search_and_select_prisoners(pris_file)
    
    if not selected_prisoners.empty:
        # Cache selected prisoners
        st.session_state.selected_prisoners = selected_prisoners
        st.session_state.prisoners_selected = True
        
        st.success(f"Selected {len(selected_prisoners)} prisoners!")
        st.markdown("---")
        colg1, colg2 = st.columns(2)
        with colg1:
            if st.button("➕ Add Selected to Print Queue", key="add_sel_to_queue_select"):
                import time as _time
                added = 0
                for idx, row in selected_prisoners.iterrows():
                    exists = any(e.get('prisoner_idx') == idx for e in st.session_state.get('envelope_queue', []))
                    if not exists:
                        if 'envelope_queue' not in st.session_state:
                            st.session_state.envelope_queue = []
                        st.session_state.envelope_queue.append({
                            'prisoner_idx': idx,
                            'name': f"{row.get('fName','')} {row.get('lName','')}",
                            'cdcr_no': row.get('CDCRno',''),
                            'housing': row.get('housing',''),
                            'address': row.get('address',''),
                            'timestamp': _time.strftime("%Y-%m-%d %H:%M"),
                            'source': 'Print Envelopes Search'
                        })
                        added += 1
                st.success(f"Added {added} to print queue")
        with colg2:
            if st.button("📝 Generate from Print Queue", type="primary"):
                if 'envelope_queue' in st.session_state and st.session_state.envelope_queue:
                    df_src = st.session_state.pris_file
                    indices = [e['prisoner_idx'] for e in st.session_state.envelope_queue]
                    st.session_state.selected_prisoners = df_src[df_src.index.isin(indices)]
                    st.session_state.prisoners_selected = True
                    st.session_state.current_page = "Generate Envelopes"
                    st.rerun()
                else:
                    st.warning("Print queue is empty")

        # Keep direct generate from current selection for convenience
        if st.button("📝 Generate Envelopes", type="secondary"):
            st.session_state.current_page = "Generate Envelopes"
            st.rerun()

def generate_envelopes_page():
    """Page for generating envelopes from selected prisoners"""
    if 'prisoners_selected' not in st.session_state or not st.session_state.prisoners_selected:
        # If no explicit selection yet, attempt to build from the unified Print Queue
        if st.session_state.get('data_loaded', False) and 'pris_file' in st.session_state and st.session_state.get('envelope_queue'):
            df_src = st.session_state.pris_file
            indices = [e['prisoner_idx'] for e in st.session_state.envelope_queue]
            selected = df_src[df_src.index.isin(indices)]
            if not selected.empty:
                st.session_state.selected_prisoners = selected
                st.session_state.prisoners_selected = True
            else:
                st.warning("Print queue indices were not found in the loaded data. Load matching data or rebuild the queue.")
                st.info("Navigate to the 'Select Prisoners' page to choose prisoners.")
                return
        else:
            st.warning("Please add prisoners to the print queue or select prisoners first!")
            st.info("Use the 'Select Prisoners' page to add to the queue, or add directly from OCR Processing.")
            return
    
    st.subheader("🖨️ Generate Envelopes")
    
    # Show selected prisoners
    selected_prisoners = st.session_state.selected_prisoners
    st.markdown(f"### Selected Prisoners ({len(selected_prisoners)} total)")
    # Show requested columns: fName, lName, CDCRno, housing, city, state, zip, Unsafe?
    display_columns = ['fName', 'lName', 'CDCRno', 'housing', 'city', 'state', 'zip', 'Unsafe?']
    # Filter to only include columns that exist in the dataframe
    existing_columns = [col for col in display_columns if col in selected_prisoners.columns]
    st.dataframe(selected_prisoners[existing_columns])
    
    # Show breakdown by safety classification
    unsafe_count = len(selected_prisoners[selected_prisoners['Unsafe?'].str.lower().str.contains('unsafe', na=False)])
    safe_count = len(selected_prisoners) - unsafe_count
    
    st.markdown("### Envelope Classification")
    col1, col2 = st.columns(2)
    col1.metric("_SAFE Environment_", safe_count)
    col2.metric("_UNSAFE Environment_", unsafe_count)
    
    st.markdown("---")
    st.markdown("#### Preview of Envelope Generation")
    st.info("This will generate two PDF files:")
    st.markdown("- **Safe Environment Envelopes** (for most prisoners)")
    st.markdown("- **Unsafe Environment Envelopes** (only if needed)")
    
    if st.button("🖨️ Create Envelopes", type="primary"):
        with st.spinner("Processing data and generating PDFs..."):
            # Process prisoner data
            safe_list, unsafe_list = process_prisoner_data(st.session_state.pris_file, selected_prisoners)
            
            # Generate timestamp
            timestamp = time.strftime("%Y%m%d-%H%M")
            
            # Create unsafe envelopes (if any)
            if len(unsafe_list) > 0:
                FROM_ADDR_UNSAFE = ('Calif. Prisoner Outreach Program',
                                    'PO Box 57648',
                                    'Sherman Oaks, CA 91413')
                unsafe_pdf = write_envelopes_buffer(FROM_ADDR_UNSAFE, unsafe_list)
                
                st.download_button(
                    label="📥 Download Unsafe Environment Envelopes",
                    data=unsafe_pdf,
                    file_name=f'envelopes_unsafe_{timestamp}.pdf',
                    mime="application/pdf",
                    key="unsafe_download"
                )
            
            # Create safe envelopes
            FROM_ADDR_SAFE = ('SCISAA',
                              'PO Box 57648',
                              'Sherman Oaks, CA 91413',
                              'Attn: Calif. Prisoner Outreach Program')
            safe_pdf = write_envelopes_buffer(FROM_ADDR_SAFE, safe_list)
            
            st.download_button(
                label="📥 Download Safe Environment Envelopes",
                data=safe_pdf,
                file_name=f'envelopes_safe_{timestamp}.pdf',
                mime="application/pdf",
                key="safe_download"
            )
            
            # Summary
            st.subheader("✅ Generation Complete")
            col1, col2 = st.columns(2)
            col1.metric("Safe Environment Envelopes", len(safe_list))
            if len(unsafe_list) > 0:
                col2.metric("Unsafe Environment Envelopes", len(unsafe_list))
            else:
                col2.metric("Unsafe Environment Envelopes", 0)
            
            st.success("PDFs generated successfully! Use the download buttons above.")
            
            # Save PDFs to server with the same timestamp
            timestamp = time.strftime("%Y%m%d-%H%M")
            
            # Create directory for saved PDFs if it doesn't exist
            pdf_dir = "saved_pdfs"
            if not os.path.exists(pdf_dir):
                os.makedirs(pdf_dir)
            
            # Save unsafe envelopes (if any)
            if len(unsafe_list) > 0:
                unsafe_filename = f'{pdf_dir}/envelopes_unsafe_{timestamp}.pdf'
                with open(unsafe_filename, "wb") as f:
                    f.write(unsafe_pdf.getbuffer())
                st.info(f"Unsafe envelopes saved to: {unsafe_filename}")
            
            # Save safe envelopes
            safe_filename = f'{pdf_dir}/envelopes_safe_{timestamp}.pdf'
            with open(safe_filename, "wb") as f:
                f.write(safe_pdf.getbuffer())
            st.info(f"Safe envelopes saved to: {safe_filename}")
            
            # Add a button to clear selections after generation
            if st.button("🔄 Start New Selection"):
                # Clear all selection-related session state
                keys_to_clear = ['selected_prisoners', 'all_selected_indices', 'selected_records', 'prisoners_selected']
                for key in keys_to_clear:
                    if key in st.session_state:
                        del st.session_state[key]
                st.success("Selections cleared! You can now select new prisoners.")
                st.rerun()

def main():
    st.set_page_config(
        page_title="Print Envelopes",
        page_icon="✉️",
        layout="wide"
    )
    
    st.title("✉️ Print Envelopes")
    # st.markdown("""
    # Generate PDF envelopes for prisoner correspondence with different return addresses 
    # based on environment safety classification.
    # """)

    # Global OCR queue banner (visible on all subpages)
    if 'envelope_queue' in st.session_state and st.session_state.envelope_queue:
        qcount = len(st.session_state.envelope_queue)
        st.info(f"📋 OCR Processing Queue: {qcount} envelope{'s' if qcount != 1 else ''} ready")

        with st.expander("View OCR Queue (from OCR Processing)"):
            for i, entry in enumerate(st.session_state.envelope_queue, 1):
                st.write(f"{i}. **{entry.get('name','')}** (CDCR #{entry.get('cdcr_no','')}) - {entry.get('timestamp','')}")
        
        # Quick actions depending on data availability
        colq1, colq2, colq3 = st.columns(3)
        with colq1:
            if st.button("➡️ Go to Select Prisoners"):
                st.session_state.current_page = "Select Prisoners"
                st.rerun()
        with colq2:
            if st.session_state.get('data_loaded', False) and 'pris_file' in st.session_state:
                if st.button("✅ Add OCR Queue to Selection (Now)"):
                    # Ensure selection set exists
                    if 'all_selected_indices' not in st.session_state:
                        st.session_state.all_selected_indices = set()
                    # Add indices from queue
                    for entry in st.session_state.envelope_queue:
                        st.session_state.all_selected_indices.add(entry['prisoner_idx'])
                    # Build selected_prisoners immediately
                    df = st.session_state.pris_file
                    selected = df[df.index.isin(st.session_state.all_selected_indices)]
                    st.session_state.selected_prisoners = selected
                    st.session_state.prisoners_selected = True
                    st.success(f"Added {qcount} queued envelopes to selection")
                    st.session_state.current_page = "Generate Envelopes"
                    st.rerun()
            else:
                st.caption("Load data first to use queue actions")
        with colq3:
            if st.button("🗑️ Clear OCR Queue (All Pages)"):
                st.session_state.envelope_queue = []
                st.success("OCR queue cleared")
                st.rerun()
    
    # Check if this is a new session or if we need to clear stale data
    if 'session_start_time' not in st.session_state:
        st.session_state.session_start_time = time.time()
    
    # Initialize session state
    if 'current_page' not in st.session_state:
        st.session_state.current_page = "Load Data"
    if 'data_loaded' not in st.session_state:
        st.session_state.data_loaded = False
    if 'prisoners_selected' not in st.session_state:
        st.session_state.prisoners_selected = False
    
    # Add a button to manually clear all session state
    if st.sidebar.button("🔄 Clear All Session Data"):
        # Clear all Print_Envelopes related session state
        keys_to_clear = [
            'selected_prisoners', 'all_selected_indices', 'selected_records', 
            'prisoners_selected', 'pris_file', 'data_loaded', 'file_name',
            'current_page', 'session_start_time'
        ]
        for key in keys_to_clear:
            if key in st.session_state:
                del st.session_state[key]
        st.session_state.current_page = "Load Data"
        st.session_state.data_loaded = False
        st.session_state.prisoners_selected = False
        st.success("All session data cleared!")
        st.rerun()
    
    # Check if session data is stale (older than 1 hour) and clear it automatically
    current_time = time.time()
    if current_time - st.session_state.session_start_time > 3600:  # 1 hour in seconds
        # Clear stale session data
        keys_to_clear = [
            'selected_prisoners', 'all_selected_indices', 'selected_records', 
            'prisoners_selected', 'pris_file', 'data_loaded', 'file_name'
        ]
        for key in keys_to_clear:
            if key in st.session_state:
                del st.session_state[key]
        st.session_state.session_start_time = current_time
        st.session_state.current_page = "Load Data"
        st.session_state.data_loaded = False
        st.session_state.prisoners_selected = False
        st.info("Stale session data cleared automatically. Please reload your data.")
    
    # Navigation of workflow
    st.sidebar.title("Workflow")
    steps = ["Load Data", "Select Prisoners", "Generate Envelopes"]
    current = st.session_state.get("current_page", "Load Data")
    
    # Create numbered navigation buttons (labels are numbered, state uses plain names)
    for i, name in enumerate(steps, start=1):
        # Brand-consistent plain text numbering
        label = f"{i}. {name}"
        if st.sidebar.button(
            label,
            key=f"nav_step_{i}",
            type="primary" if current == name else "secondary",
            use_container_width=True
        ):
            # When leaving Generate Envelopes, clear selection state to avoid stale data
            if current == "Generate Envelopes" and name != "Generate Envelopes":
                keys_to_clear = [
                    'selected_prisoners', 'all_selected_indices', 'selected_records', 
                    'prisoners_selected'
                ]
                for key in keys_to_clear:
                    if key in st.session_state:
                        del st.session_state[key]
            st.session_state.current_page = name
            st.rerun()
    
    # Display current page
    if st.session_state.current_page == "Load Data":
        # Check if there's stale data and show a warning
        stale_data_keys = ['selected_prisoners', 'all_selected_indices', 'selected_records', 'prisoners_selected']
        has_stale_data = any(key in st.session_state for key in stale_data_keys)
        
        if has_stale_data:
            st.warning("⚠️ Stale session data detected. Please use the 'Clear All Session Data' button in the sidebar if you see unexpected data.")
        
        load_data_page()

        #Confidential notification
        st.markdown("""
        <div style='text-align: center;'>
            <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
        </div>
        """, unsafe_allow_html=True)

    elif st.session_state.current_page == "Select Prisoners":
        # Check if there's stale data and show a warning (refined)
        stale_data_keys = ['selected_prisoners', 'all_selected_indices', 'selected_records', 'prisoners_selected']
        stale_keys_present = any(key in st.session_state for key in stale_data_keys)
        has_stale_data = stale_keys_present and not st.session_state.get('data_loaded', False)
        
        if has_stale_data:
            st.warning("⚠️ Selection state exists but no data is loaded. Use 'Load Data' or 'Clear All Session Data' if you see unexpected data.")
        
        select_prisoners_page()

        #Confidential notification
        st.markdown("""
        <div style='text-align: center;'>
            <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
        </div>
        """, unsafe_allow_html=True)

    elif st.session_state.current_page == "Generate Envelopes":
        generate_envelopes_page()

if __name__ == "__main__":
    main()
