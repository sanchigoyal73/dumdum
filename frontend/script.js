document.addEventListener('DOMContentLoaded', () => {
    // Get button elements
    const viewDirectoryBtn = document.getElementById('view-directory-btn');
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const systemConfigBtn = document.getElementById('system-config-btn');
    const internalToolsBtn = document.getElementById('internal-tools-btn');
    const searchEmployeeBtn = document.getElementById('search-employee-btn');
    
    // Get the response display element
    const responseDisplay = document.getElementById('response-display');

    // Helper function to display data in the <pre> tag
    const displayResponse = (data) => {
        responseDisplay.textContent = JSON.stringify(data, null, 2);
    };

    // Helper function to display errors
    const displayError = (error) => {
        responseDisplay.textContent = `An error occurred while fetching data: ${error.message}`;
    };

    // --- Wire up button click events ---

    // View Staff Directory -> /api/users
    viewDirectoryBtn.addEventListener('click', () => {
        fetch('/api/users')
            .then(response => response.json())
            .then(data => displayResponse(data))
            .catch(error => displayError(error));
    });

    // Admin Panel -> /api/admin
    adminPanelBtn.addEventListener('click', () => {
        fetch('/api/admin')
            .then(response => response.json())
            .then(data => displayResponse(data))
            .catch(error => displayError(error));
    });

    // System Config -> /api/config
    systemConfigBtn.addEventListener('click', () => {
        fetch('/api/config')
            .then(response => response.json())
            .then(data => displayResponse(data))
            .catch(error => displayError(error));
    });

    // Internal Tools -> /api/internal
    internalToolsBtn.addEventListener('click', () => {
        fetch('/api/internal')
            .then(response => response.json())
            .then(data => displayResponse(data))
            .catch(error => displayError(error));
    });

    // Search Employee -> /api/search?q=...
    searchEmployeeBtn.addEventListener('click', () => {
        // Using a hardcoded query that looks legitimate but contains a payload
        const query = 'hello<script>alert("XSS")</script>'; 
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => displayResponse(data))
            .catch(error => displayError(error));
    });
});
