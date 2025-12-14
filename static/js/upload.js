const fileInput = document.getElementById('fileInput');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    uploadFile(file);
});

function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Mostra la barra di progresso
    progressContainer.style.display = 'block';
    
    const xhr = new XMLHttpRequest();
    
    // Aggiorna la barra di progresso
    xhr.upload.addEventListener('progress', function(e) {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            progressBar.style.width = percentComplete + '%';
            progressText.textContent = Math.round(percentComplete) + '%';
        }
    });
    
    // Gestione della risposta
    xhr.addEventListener('load', function() {
        if (xhr.status === 200) {
            // Redirect alla pagina di visualizzazione
            window.location.href = xhr.responseURL;
        } else {
            alert('Errore nel caricamento del file');
            progressContainer.style.display = 'none';
        }
    });
    
    xhr.addEventListener('error', function() {
        alert('Errore di rete durante il caricamento');
        progressContainer.style.display = 'none';
    });
    
    xhr.open('POST', '/upload', true);
    xhr.send(formData);
}
