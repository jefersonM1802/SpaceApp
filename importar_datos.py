import joblib
import pymongo
from pymongo import MongoClient
import numpy as np

# --- CONFIGURACIÓN ---
MODEL_FILE = 'datos_climaticos_completos.pkl'
# ¡IMPORTANTE! Asegúrate de que esta sea tu cadena de conexión correcta.
MONGO_URI = "mongodb+srv://2022210241_db_user:9Q05IZyjV4ZMzHex@datosclimaticos.zslpbdj.mongodb.net/?retryWrites=true&w=majority&appName=datosClimaticos" 

# --- LÓGICA DE MIGRACIÓN ---
print("Cargando el archivo .pkl (puede tardar)...")
try:
    agente_climatico = joblib.load(MODEL_FILE)
except FileNotFoundError:
    print(f"❌ ERROR: No se encontró el archivo '{MODEL_FILE}'.")
    exit()

print(f"Conectando a MongoDB Atlas...")
try:
    client = MongoClient(MONGO_URI)
    # El comando 'ping' verifica que la conexión fue exitosa.
    client.admin.command('ping')
    db = client.EcoWeatherDB
    collection = db.ClimaHorario
    print("✅ Conexión a MongoDB exitosa.")
except Exception as e:
    print(f"❌ ERROR DE CONEXIÓN: Revisa tu cadena de conexión. Error: {e}")
    exit()

print("Borrando datos antiguos en la colección...")
collection.delete_many({})

print(f"Preparando todos los registros ({len(agente_climatico)} documentos) para la inserción.")
documentos = []
for fecha_hora_str, data in agente_climatico.items():
    # Ya no hay filtro de años, procesamos todos los datos.
    puntos_lista = data['puntos'].tolist()
    doc = {
        "_id": fecha_hora_str,
        "puntos": puntos_lista,
        "temperatura": data['temperatura'].tolist(),
        "humedad": data['humedad'].tolist(),
        "precipitacion": data['precipitacion'].tolist()
    }
    documentos.append(doc)

print(f"Insertando {len(documentos)} documentos en la base de datos (10 años completos)...")
try:
    # 'ordered=False' puede acelerar un poco la inserción masiva
    collection.insert_many(documentos, ordered=False)
    print("\n✅ ¡MIGRACIÓN DE 10 AÑOS COMPLETADA CON ÉXITO!")
except Exception as e:
    print(f"\n❌ ERROR durante la inserción de datos: {e}")

client.close()