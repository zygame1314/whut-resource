const AUTH_API_URL = API_ENDPOINTS.auth;
let currentUser = null;
let token = localStorage.getItem('authToken');
const originalFetch = window.fetch;
