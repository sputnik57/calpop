# Utils Folder

This folder contains reusable utility functions and components for the Streamlit application.

## Search Widget

The `search_widget.py` file contains a reusable search component that can be integrated into any page of the application.

### Usage

```python
from utils.search_widget import render_search_widget

# Basic usage
search_results = render_search_widget(df=your_dataframe)

# With custom parameters
search_results = render_search_widget(
    df=your_dataframe,
    search_column='column_name',
    display_columns=['col1', 'col2', 'col3'],
    search_label="Search by Name",
    button_label="Find Records"
)
```

### Parameters

- `df` (pandas.DataFrame): The dataframe to search in
- `search_column` (str): The column name to search in (default: 'lName')
- `display_columns` (list): List of columns to display in results (default: all columns)
- `search_label` (str): Label for the search input field (default: "Search")
- `button_label` (str): Label for the search button (default: "Search")

### Return Value

The function returns a pandas.DataFrame with the search results, or None if no search was performed or if there was an error.
