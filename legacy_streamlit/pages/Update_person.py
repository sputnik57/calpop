import sys
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
    
import streamlit as st
import pandas as pd
from core.database import save_data
from utils.search_widget import render_search_widget

def render_update_person():
    # Initialize session state if needed
    if 'df' not in st.session_state:
        st.session_state.df = pd.DataFrame()
        st.warning("No data loaded yet. Please upload data in the main application.")
        return

    st.markdown('<h2 class="section-header">✏️ Update Person</h2>', unsafe_allow_html=True)

    # Display all available columns
    st.subheader("Available Columns:")
    all_columns = st.session_state.df.columns.tolist()
    st.write(", ".join(all_columns))

    # Step 1: Find person using the search widget
    st.subheader("Step 1: Find Person")
    
    # Use our search widget to search the main data
    search_results = render_search_widget(
        df=st.session_state.df,
        search_column='lName',
        display_columns=['fName', 'lName', 'CDCRno', 'Sponsor', 'Stage', 'housing', 'address'],
        search_label="Search by Last Name",
        button_label="Search Person"
    )

    if search_results is not None and not search_results.empty:
        #Confidential notification
        st.markdown("""
        <div style='text-align: center;'>
            <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
        </div>
        """, unsafe_allow_html=True)


        # Step 2: Select person from search results
        options = [f"Row {idx}: {row['fName']} {row['lName']}" for idx, row in search_results.iterrows()]
        selected = st.selectbox("Select Person:", options)

        if selected:
            row_idx = int(selected.split(":")[0].replace("Row ", ""))
            current_data = st.session_state.df.iloc[row_idx]

            # Step 3: Select columns to update
            st.subheader("Step 2: Select Columns to Update")
            selected_columns = st.multiselect(
                "Choose columns to update:",
                options=all_columns,
                default=["fName", "lName", "CDCRno", "housing", "letter exchange (received only)"]
            )

            # Step 4: Update form
            if selected_columns:
                st.subheader("Step 3: Update Information")

                #Confidential notification
                st.markdown("""
                <div style='text-align: center;'>
                    <span style='color: red; font-size: 24px; font-weight: bold;'>CONFIDENTIAL PERSONAL INFO</span>
                </div>
                """, unsafe_allow_html=True)


                with st.form(f"update_person_{row_idx}"):
                    # Create dynamic form fields based on selected columns
                    columns = st.columns(2)
                    col_idx = 0

                    updated_values = {}
                    for i, column in enumerate(selected_columns):
                        with columns[col_idx]:
                            current_value = current_data.get(column, "")
                            # Use text_area for longer text fields, text_input for shorter ones
                            if "letter" in column.lower() or "address" in column.lower():
                                updated_values[column] = st.text_area(
                                    column,
                                    value=current_value,
                                    height=100,
                                    key=f"field_{column}"
                                )
                            else:
                                updated_values[column] = st.text_input(
                                    column,
                                    value=current_value,
                                    key=f"field_{column}"
                                )
                        col_idx = 1 - col_idx  # Alternate between columns

                    update_submitted = st.form_submit_button("Save Changes", type="primary")

                    if update_submitted:
                        df = st.session_state.df
                        # Update all selected columns
                        for column, value in updated_values.items():
                            df.at[row_idx, column] = value

                        save_data(df)
                        st.success("✅ Person updated successfully!")
                        st.rerun()
            else:
                st.info("Please select at least one column to update.")
    elif search_results is not None and search_results.empty:
        st.info("No matches found for the search term.")


render_update_person()
