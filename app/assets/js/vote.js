const vote = async (articleId, vote) => {
    const userId = localStorage.getItem('userId');
    const payload = { userId, articleId, vote };

    const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.data?.userId) {
        localStorage.setItem('userId', result.data.userId);
    }

    updateVotes(articleId);
    disableArrows(articleId);
}

const updateVotes = async (articleId) => {
    const voteCountResponse = await fetch(`/api/vote/${articleId}`);
    const voteCountResult = await voteCountResponse.json();
    document.querySelector('#vote-count').textContent = voteCountResult.totalVotes;
}

const disableArrows = async (articleId) => {
    const userId = localStorage.getItem('userId');
    if (!userId){
        return;
    }
    const response = await fetch(`/api/vote/${userId}/${articleId}`);
    const result = await response.json();
    document.getElementById('upvote').disabled = (result?.vote == 1);
    document.getElementById('downvote').disabled = (result?.vote == -1);
}