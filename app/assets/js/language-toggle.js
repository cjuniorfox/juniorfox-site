document.addEventListener('DOMContentLoaded', () => {
    const languageSelect = document.getElementById('language-select');
    languageSelect.addEventListener('change', (event) => {
        const selectedLang = event.target.value;
        window.location.href = `/lang/${selectedLang}`; // Adjust the URL structure as needed
    });
});