# Streamlit Prisoner Management Dashboard with Google Vision OCR
# Save as: Home.py
# Run with: streamlit run Home.py

import streamlit as st
import pandas as pd
import io
from datetime import datetime
import os




# CUSTOM CSS
st.markdown("""
<style>
    .main-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        margin-bottom: 30px;
    }
    .section-header {
        color: #444;
        border-bottom: 2px solid #667eea;
        padding-bottom: 5px;
        margin-bottom: 15px;
    }
    .success-box {
        padding: 10px;
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        border-radius: 5px;
        margin: 10px 0;
    }
    .error-box {
        padding: 10px;
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 5px;
        margin: 10px 0;
    }
</style>
""", unsafe_allow_html=True)

#HEADER
# Page config
st.set_page_config(
    page_title="Prisoner Management System",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)
# Main dashboard
st.markdown('<div class="main-header"><h1>📊 California Prisoner Outreach Program</h1><p>Secure data management with OCR integration</p></div>', unsafe_allow_html=True)


# LOADING DATA FILE
# CONFIGURATION: Columns to display in dataframes
# This configuration can be copied to other pages where XLSX files are uploaded
DISPLAY_COLUMNS = [
    'Stage', 'fName', 'lName', 'Unsafe?', 'CDCRno', 'housing', 'address', 'city', 
    'state', 'zip', 'Sponsor', 'CPID', 
    'letter exchange (received only)', 'Step (received only)'
]

# Helper function to filter dataframe columns for display
# This function preserves the original dataframe while showing only selected columns
# It also handles cases where some columns might not exist in the dataframe
def filter_display_columns(df, columns):
    """Filter dataframe to show only specified columns that exist in the dataframe"""
    existing_columns = [col for col in columns if col in df.columns]
    return df[existing_columns] if existing_columns else df

# Sample fallback data
sample_data = {
    'fName': ['John', 'Jane', 'Bob'],
    'lName': ['Doe', 'Smith', 'Johnson'],
    'CDCRno': ['A123456', 'B789012', 'C345678'],
    'Sponsor': ['Alice T', 'Dave R', 'Alice T'],
    'Stage': [12, 11, 12],
    'city': ['Los Angeles', 'San Diego', 'Oakland'],
    'CPID':['ABC123','DEF456','GHI789'],
    'state': ['CA', 'CA', 'CA'],
    'zip': [90001, 92101, 94601]
}

# ✅ Cached loader that accepts raw bytes
@st.cache_data
def load_excel_from_bytes(file_bytes):
    return pd.read_excel(io.BytesIO(file_bytes))

# Import directory selection widget
from utils.directory_selection_widget import directory_selection_widget

# 📥 Directory Selection
directory_selection_widget()

# 📥 Upload and cache logic
uploaded_file = st.file_uploader("📤 Upload Excel File", type=["xlsx"])

if uploaded_file:
    # Read file bytes once and store in session
    file_bytes = uploaded_file.read()
    st.session_state.file_bytes = file_bytes
    st.session_state.file_name = uploaded_file.name

    # Load and cache the DataFrame
    df = load_excel_from_bytes(file_bytes)
    st.session_state.df = df

    st.markdown(f"### 📁 **Loaded File:** `{uploaded_file.name}`")
    st.markdown(f"📈 **Total records loaded:** {len(df)}")
    # Display only selected columns for preview
    st.dataframe(filter_display_columns(df.head(), DISPLAY_COLUMNS))
else:
    st.info("Upload an Excel file to begin.")



#SOMETHING
# Initialize session state
if 'df' not in st.session_state:
    st.session_state.df = pd.DataFrame(sample_data)



# SIDEBAR DISPLAY
# Display current database info in Sidebar


st.sidebar.metric("Total Records", len(st.session_state.df))
st.sidebar.metric("Today's date", datetime.now().strftime("%d %b %Y"))
st.sidebar.metric("Time", datetime.now().strftime("%H:%M"))


# DATA SUMMARY BEGINS

#Confidential notification
st.markdown("""
<div style='text-align: center;'>
    <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
</div>
""", unsafe_allow_html=True)



st.markdown("---")

# ACTIVE SPONSOR COUNT
# Ensure Stage is numeric
st.session_state.df['Stage'] = pd.to_numeric(st.session_state.df['Stage'], errors='coerce')

# Filter active sponsees
active_df = st.session_state.df[st.session_state.df['Stage'] == 12]

# Count unique sponsors and total active sponsees
num_active_sponsors = active_df['Sponsor'].nunique()
num_active_sponsees = active_df.shape[0]

# Display summary
st.markdown(f"### 📊 Active Sponsorship Count")
st.markdown(f"- 🧑‍🤝‍🧑 **Sponsors with active sponsees:** {num_active_sponsors}")
st.markdown(f"- 📋 **Total active sponsees (Stage 12):** {num_active_sponsees}")
st.dataframe(active_df['Sponsor'].value_counts().rename("Active Sponsees"))

# Display same summary data in sidebar
st.sidebar.markdown("---")
st.sidebar.metric(label="Active Sponsors", value=num_active_sponsors)
st.sidebar.metric(label="Active Sponsees", value=num_active_sponsees)



# SPONSOR SPECIFIC DATA
st.markdown("### 🔍 Filter Active Sponsees by Sponsor")
# Filter by Sponsor and Stage == 12, excluding nulls
# Ensure Stage is numeric
st.session_state.df['Stage'] = pd.to_numeric(st.session_state.df['Stage'], errors='coerce')

# Filter sponsors with at least one Stage == 12
eligible_sponsors = st.session_state.df[
    st.session_state.df['Stage'] == 12
]['Sponsor'].dropna().unique()

# Dropdown only shows eligible sponsors
selected_sponsor = st.selectbox(
    "Choose a Sponsor (Stage = 12 only)",
    eligible_sponsors,
    key="choose_sponsor_stage12_home"
)

# Final filtered DataFrame
filtered_df = st.session_state.df[
    (st.session_state.df['Sponsor'] == selected_sponsor) &
    (st.session_state.df['Stage'] == 12)
]

record_count = filtered_df.shape[0]

if record_count > 0:
    st.markdown(f"**📦 Active sponsees found:** {record_count} for `{selected_sponsor}`:")
    # Display only selected columns for filtered data
    st.dataframe(filter_display_columns(filtered_df, DISPLAY_COLUMNS))
else:
    st.warning(f"No active sponsees found for `{selected_sponsor}`.")



# SUMMARY STATISTICS
st.markdown("### Summary Statistics")
st.dataframe(st.session_state.df.describe(include='all').transpose())

# PREVIEW ALL DATA
st.markdown("### Preview Total Data")
n = st.slider("Rows to preview", 5, 50, 10)
# Display only selected columns in preview slider
st.dataframe(filter_display_columns(st.session_state.df.head(n), DISPLAY_COLUMNS))


#Confidential notification
st.markdown("""
<div style='text-align: center;'>
    <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL</span>
</div>
""", unsafe_allow_html=True)
