import sys
import os
import pandas as pd

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import streamlit as st
from utils.search_widget import render_search_widget

# CONFIGURATION: Columns to display in search results
# This configuration can be customized for different search views
DISPLAY_COLUMNS = [
    'Stage', 'fName', 'lName', 'Unsafe?', 'CDCRno', 'housing', 'address', 'city', 
    'state', 'zip', 'Sponsor', 'CPID', 
    'letter exchange (received only)', 'Step (received only)'
]

def render_search():
    st.markdown('<h2 class="section-header">🔍 Search & View Records</h2>', unsafe_allow_html=True)
    
    # Initialize session state if needed
    if 'df' not in st.session_state:
        st.session_state.df = pd.DataFrame()
        st.warning("No data loaded yet. Please upload data in the main application.")
        return

    # Use the reusable search widget
    # This replaces the previous manual search implementation
    search_results = render_search_widget(
        df=st.session_state.df,
        search_column='lName',
        display_columns=DISPLAY_COLUMNS,
        search_label="Search by Last Name",
        button_label="Search"
    )
    
    # Optional: You can process the search results further if needed

    # For example, you could add additional actions on the search results
    if search_results is not None and not search_results.empty:

        #Confidential notification
        st.markdown("""
        <div style='text-align: center;'>
            <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
        </div>
        """, unsafe_allow_html=True)


render_search()
