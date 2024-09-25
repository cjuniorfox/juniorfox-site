const langController = {
    lang: (req, res) => {
        try {
            res.cookie('locale', req.params.locale);
            const redirectUrl = req.query?.redirect || 'back';
            return res.redirect(redirectUrl);
        } catch (error) {
            console.error('Error in langController:', error);
            return res.status(500).send('Internal Server Error');
        }
    }
};

module.exports = langController;