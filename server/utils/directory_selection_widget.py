"""
Directory Selection Widget for Streamlit Applications
"""
import streamlit as st


def directory_selection_widget():
    """
    Creates a directory selection dropdown widget for reference purposes.
    
    This widget displays common directories as a reference guide for users,
    since Streamlit's file_uploader cannot set default directories.
    
    It works for wsl, local host paths seen in popup folder selectors, not absolute reference paths used in linux.

    Returns:
        str: The selected directory path for reference
    """
    # Common directories for reference (using absolute paths for WSL reliability)
    common_directories_2 = {
        "Linux project root folder:  \\\\wsl.localhost\\Ubuntu\\home\\me-linux3\\projects\\sponsor_dashboard":"",
        "Curriculum:  E:\OneDrive - teKnoculture\SAA\CA_prisoners\curriculum":"",
        "CODING-CalPOP (Windows):  E:\OneDrive - teKnoculture\CODING\CalPOP":"",
        "Letters by Rey/Course (Windows): E:\OneDrive - teKnoculture\SAA\CA_prisoners\to prisoners\course_students":"",
        "OCR images (testing folder):  ":"",
        "Saved PDFs:  \\\\wsl.localhost\\Ubuntu\\home\\me-linux3\\projects\\sponsor_dashboard\\saved_pdfs":"",
        "Saved letter images:  \\\\wsl.localhost\\Ubuntu\\home\\me-linux3\\projects\\sponsor_dashboard\\saved_images":"",
        "Screenshot dir:  ":"",
        "Downloaded files:  ":""
    }

    #st.markdown("### Select a Directory")
    selected_directory = st.selectbox(
        "## **1. Select a Directory (Cut and Paste)**",
        list(common_directories_2.keys()),
        index=0
    )

    # Display selected directory path for user guidance
    selected_path = common_directories_2[selected_directory]
    #st.info(f"📁 Cut and paste this reference path: {selected_directory}: `{selected_path}`")
    
    return selected_path
