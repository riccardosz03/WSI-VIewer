document.addEventListener('DOMContentLoaded', () => {
    const uploadBox = document.querySelector('.upload-box');
    const fileInput = document.getElementById('fileInput');

    // PREVENIRE IL COMPORTAMENTO DEL BROWSER PER IL DRAG AND DROP
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // EVIDENZIARE LA ZONA DI DRAG
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadBox.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, unhighlight, false);
    });

    uploadBox.addEventListener('drop', handleDrop, false);
    
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

        if (!file.name.toLowerCase().endsWith('.svs')) {
            alert('Carica un file .svs');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        uploadBox.classList.add('uploading');
        
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