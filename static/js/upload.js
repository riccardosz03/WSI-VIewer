document.addEventListener('DOMContentLoaded', () => {
    const uploadBox = document.querySelector('.upload-box');
    const fileInput = document.getElementById('fileInput');

    // Previeni il comportamento predefinito del browser per il drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Evidenzia la zona di drop quando si trascina un file sopra
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadBox.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, unhighlight, false);
    });

    // Gestisci il drop del file
    uploadBox.addEventListener('drop', handleDrop, false);
    
    // Gestisci la selezione del file tramite click
    fileInput.addEventListener('change', handleFileSelect, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        uploadBox.classList.add('highlight');
    }

    function unhighlight(e) {
        uploadBox.classList.remove('highlight');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        handleFile(file);
    }

    function handleFile(file) {
        if (!file) return;

        // Verifica che il file sia nel formato corretto
        if (!file.name.toLowerCase().endsWith('.svs')) {
            alert('Per favore, carica un file .svs');
            return;
        }

        // Crea il FormData e aggiungi il file
        const formData = new FormData();
        formData.append('file', file);

        // Mostra indicatore di caricamento
        uploadBox.classList.add('uploading');
        
        // Invia il file al server
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Errore nel caricamento del file');
            }
            return response;
        })
        .then(response => {
            // Il server reindirizza automaticamente alla pagina di visualizzazione
            window.location.href = response.url;
        })
        .catch(error => {
            console.error('Errore:', error);
            alert('Si è verificato un errore durante il caricamento del file');
            uploadBox.classList.remove('uploading');
        });
    }
});