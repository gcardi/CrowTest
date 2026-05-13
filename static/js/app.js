document.getElementById('greetButton').addEventListener('click', async () => {
    const messageEl = document.getElementById('message');
    messageEl.textContent = 'Sto contattando il server...';

    try {
        const response = await fetch('/hello/CrowTest');
        const text = await response.text();
        messageEl.textContent = response.ok ? text : 'Errore: ' + response.status;
    } catch (error) {
        messageEl.textContent = 'Errore di rete: ' + error.message;
    }
});
