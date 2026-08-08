import streamlit as st
import pandas as pd

def render_search_widget(df, search_column='lName', display_columns=None, search_label="Search", button_label="Search"):
    """
    Render a reusable search widget for Streamlit applications.
    
    Parameters:
    df (pandas.DataFrame): The dataframe to search in
    search_column (str): The column name to search in (default: 'lName')
    display_columns (list): List of columns to display in results (default: all columns)
    search_label (str): Label for the search input field
    button_label (str): Label for the search button
    
    Returns:
    pandas.DataFrame: Filtered dataframe with search results, or None if no search performed
    """
    # Initialize session state if needed
    if df is None or df.empty:
        st.warning("No data available for search.")
        return None

    # Set default display columns if not provided
    if display_columns is None:
        display_columns = df.columns.tolist()
    
    # Ensure display columns exist in dataframe
    existing_display_columns = [col for col in display_columns if col in df.columns]
    
    # Create search UI
    col1, col2 = st.columns([2, 1])

    with col1:
        search_term = st.text_input(f"{search_label}:", placeholder=f"Enter search term")

    with col2:
        search_btn = st.button(button_label, type="primary")

    # Perform search when button is clicked and search term is provided
    if search_btn and search_term:
        try:
            # Check if search column exists
            if search_column not in df.columns:
                st.error(f"Search column '{search_column}' not found in data")
                return None
            
            # Perform search
            matches = df[
                df[search_column].str.contains(search_term, case=False, na=False)
            ]

            if matches.empty:
                st.error(f"No matches found for '{search_term}'")
                return matches  # Return empty dataframe
            else:
                st.success(f"Found {len(matches)} match(es)")
                # Display only specified columns if provided
                if existing_display_columns:
                    st.dataframe(matches[existing_display_columns], use_container_width=True)
                else:
                    st.dataframe(matches, use_container_width=True)
                return matches
        except Exception as e:
            st.error(f"Error during search: {str(e)}")
            return None
    
    # If no search performed, return None
    return None
