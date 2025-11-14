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
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        if (progressContainer) progressContainer.style.display = 'block';
        if (progressBar) { progressBar.style.width = '0%'; progressBar.style.opacity = '0'; }

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const bar = document.getElementById('progress-bar');
                const text = document.getElementById('progress-text');
                if (bar) {
                    bar.style.width = `${percent}%`;
                    if (percent === 0) {
                        bar.style.opacity = '0';
                    } else {
                        bar.style.opacity = '1';
                    }
                }
                if (text) {
                    text.textContent = `${percent}%`;
                }
            }
        };

        xhr.onload = function() {
            if(xhr.status >= 200 && xhr.status < 300) {
                window.location.href = xhr.responseURL;
            }
            else {
                alert('Errore nel nel caricamento del file');
                uploadBox.classList.remove('uploading');
                if (progressContainer) progressContainer.style.display = 'none';
            }
        };

        xhr.onerror = function() {
            alert('Errore di rete durante upload');
            uploadBox.classList.remove('uploading');
            if (progressContainer) progressContainer.style.display = 'none';
        };
        xhr.send(formData);
    }
});