from flask import Flask, send_file, request, render_template, redirect, url_for, jsonify
from PIL import Image
import io
import os
import openslide
import math

app = Flask(__name__)
UPLOAD_FOLDER = 'data/'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
SLIDE_CACHE = {}

def slide_path(filename):
    safe = os.path.basename(filename)
    return os.path.join(app.config['UPLOAD_FOLDER'], safe)


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files['file']
    if file and file.filename.endswith('.svs'):
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(filepath)
        print(f"File {filepath} caricato con successo.")
        return redirect(url_for('view_file', filename=file.filename))
    return 'Formato file non supportato', 400
    
@app.route('/view_image/<filename>')
def view_file(filename):
    filepath = slide_path(filename)
    if not os.path.exists(filepath):
        return 'File non trovato', 404
    
    # Apri lo slide solo se non è già in cache
    if filepath not in SLIDE_CACHE:
        try:
            slide = openslide.OpenSlide(filepath)
            SLIDE_CACHE[filepath] = slide
        except Exception as e:
            return f'Errore nell\'apertura del file: {str(e)}', 500
    
    slide = SLIDE_CACHE[filepath]
    dimensions = slide.dimensions
    return render_template('view_image.html', 
                         filename=filename,
                         width=dimensions[0],
                         height=dimensions[1])

@app.route('/slide/<filename>/info')
def slide_info(filename):
    filepath = slide_path(filename)
    if filepath not in SLIDE_CACHE:
        try:
            slide = openslide.OpenSlide(filepath)
            SLIDE_CACHE[filepath] = slide
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    slide = SLIDE_CACHE[filepath]
    return jsonify({
        'dimensions': slide.dimensions,
        'level_count': slide.level_count,
        'level_dimensions': slide.level_dimensions,
        'level_downsamples': slide.level_downsamples,
        'properties': dict(slide.properties)
    })

@app.route('/slide/<filename>/tile')
def slide_tile(filename):
    x = int(request.args.get('x', 0))
    y = int(request.args.get('y', 0))
    level = int(request.args.get('level', 0))
    size = int(request.args.get('size', 256))
    
    filepath = slide_path(filename)
    if filepath not in SLIDE_CACHE:
        try:
            slide = openslide.OpenSlide(filepath)
            SLIDE_CACHE[filepath] = slide
        except Exception as e:
            return f'Errore nell\'apertura del file: {str(e)}', 500
    
    slide = SLIDE_CACHE[filepath]
    
    # Calcola il fattore di scala per il livello richiesto
    scale = slide.level_downsamples[level]
    
    # Converti le coordinate del tile al livello 0
    x0 = int(x * scale)
    y0 = int(y * scale)
    
    # Leggi il tile
    tile = slide.read_region((x0, y0), level, (size, size))
    
    # Converti in PNG
    buf = io.BytesIO()
    tile.convert('RGB').save(buf, format='PNG')
    buf.seek(0)
    
    return send_file(buf, mimetype='image/png')

@app.route('/slide/<filename>/thumbnail')
def slide_thumbnail(filename):
    width = int(request.args.get('width', 300))
    
    filepath = slide_path(filename)
    if filepath not in SLIDE_CACHE:
        try:
            slide = openslide.OpenSlide(filepath)
            SLIDE_CACHE[filepath] = slide
        except Exception as e:
            return f'Errore nell\'apertura del file: {str(e)}', 500
    
    slide = SLIDE_CACHE[filepath]
    
    # Calcola l'altezza proporzionale
    thumb_size = slide.level_dimensions[0]
    height = int(width * thumb_size[1] / thumb_size[0])
    
    # Genera la thumbnail
    thumb = slide.get_thumbnail((width, height))
    
    # Converti in PNG
    buf = io.BytesIO()
    thumb.convert('RGB').save(buf, format='PNG')
    buf.seek(0)
    
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)