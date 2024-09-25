document.addEventListener('DOMContentLoaded', () => {
    const redirectToLang = (selectedLang) => {
        try {
            const otherLangs = JSON.parse(document.getElementById('other-langs').value);
            const lang = otherLangs.find(item => item.lang === selectedLang);
            return lang?.article ? `?redirect=/article/${lang.article}` : '';
        } catch (e) {
            console.error('Error parsing otherLangs:', e);
            return '';
        }
    };

    const languageSelect = document.getElementById('language-select');
    languageSelect.addEventListener('change', (event) => {
        const selectedLang = event.target.value;
        window.location.href = `/lang/${selectedLang}${redirectToLang(selectedLang)}`;
    });
});