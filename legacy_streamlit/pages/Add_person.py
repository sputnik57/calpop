import sys
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import streamlit as st
import pandas as pd
from core.cipher import caesar_code
from core.database import save_data

def render_add_person():
    # Initialize session state for form fields if needed
    form_fields = ['fname', 'lname', 'cdcr', 'housing', 'address', 'city', 'state', 'zip_code', 'language', 'sponsor']
    for field in form_fields:
        if field not in st.session_state:
            st.session_state[field] = ""

    # Initialize session state for df if needed
    if 'df' not in st.session_state:
        st.session_state.df = pd.DataFrame()

    st.markdown('<h2 class="section-header">➕ Add New Person</h2>', unsafe_allow_html=True)

    with st.form("add_person"):
        col1, col2 = st.columns(2)

        with col1:
            fname = st.text_input("First Name*", value=st.session_state.fname)
            lname = st.text_input("Last Name*", value=st.session_state.lname)
            cdcr = st.text_input("CDCR Number*", value=st.session_state.cdcr)
            housing = st.text_input("Housing", value=st.session_state.housing)
            address = st.text_input("Address", value=st.session_state.address)

        with col2:
            city = st.text_input("City", value=st.session_state.city)
            state = st.text_input("State", value=st.session_state.state)
            zip_code = st.text_input("ZIP Code", value=st.session_state.zip_code)
            language = st.text_input("Language", value=st.session_state.language)
            sponsor = st.text_input("Sponsor", value=st.session_state.sponsor)

        submitted = st.form_submit_button("Add Person", type="primary")

        if submitted:
            if fname and lname and cdcr:
                code = caesar_code(fname, lname, cdcr)

                new_row = {
                    'fName': fname,
                    'lName': lname,
                    'CDCRno': cdcr,
                    'housing': housing,
                    'address': address,
                    'city': city,
                    'state': state,
                    'zip': zip_code,
                    'language': language,
                    'Sponsor': sponsor,
                    'letter exchange (received only)': '',
                    'code': code
                }

                st.session_state.df = pd.concat([st.session_state.df, pd.DataFrame([new_row])], ignore_index=True)
                save_data(st.session_state.df)
                st.success(f"✅ Person added successfully! Code: {code}")
                
                # Clear form fields after successful submission
                for field in form_fields:
                    st.session_state[field] = ""
                
                st.rerun()
            else:
                st.error("Please fill in required fields (marked with *)")
    
    
render_add_person()
