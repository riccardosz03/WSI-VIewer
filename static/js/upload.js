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
            alert('Carica un file .svs');
            return;
        }

        // Crea il FormData e aggiungi il file
        const formData = new FormData();
        formData.append('file', file);

        // Mostra indicatore di caricamento
        uploadBox.classList.add('uploading');
        
        // Invia il file al server
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);
        document.getElementById('progress-container').style.display = 'block';

        xhr.upload.onprogress = function (e) {
            if(e.lenghtComputable){
                const percent = (e.loaded / e.total) * 100;
                document.getElementById('progress-bar').style.width = `${percent}%`;
            }
        };

        xhr.onload = function() {
            if(xhr.status >= 200 && xhr.status < 300) {
                window.location.href = xhr.responseURL;
            }
            else {
                alert('Errore nel nel caricamento del file');
                uploadBox.classList.remove('uploading');
                document.getElementById('progress-container').style.display = 'None';
            }
        };

        xhr.onerror = function() {
            alert('Errore di rete durante upload');
            uploadBox.classList.remove('uploading');
            document.getElementById('progress-container').style.display = 'None';
        };
        xhr.send(formData);
    }
});