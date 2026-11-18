# Péndulo TRRL — aplicativo de campo

Toma de datos del ensayo de péndulo TRRL en el celular, sin internet, y exportación al mismo modelo de Excel.

## Qué hace

- **Puentes**: se crea una medición, se agregan los subtramos (número y nombre) y dentro de cada uno los puentes (nombre y progresiva km + m). Cada puente tiene los puntos INICIO, MEDIO y FIN.
- **Cada 100 m por km sorteado**: se ingresan los km sorteados (a mano, por ejemplo `42 58 59`, o importando el Excel de sorteo) y la aplicación genera los 11 puntos de cada km (42+000 a 43+000, cada 100 m). La calzada puede ser única, derecha o izquierda.
- Por punto: 5 lecturas del carril derecho, 5 del izquierdo, temperatura ambiente y del agua. Calcula BPN, FA(20), BPNA y CRD en pantalla (CRD menor a 0,40 se marca en rojo, como en el Excel).
- **Exportar Excel**: genera el mismo modelo (estilos, logos, fórmulas, saltos de página). Modo puentes: una hoja por subtramo (ST4, ST5…) con todos sus puentes. Modo km: una sola hoja con todos los subtramos.
- **Concesión**: lista desplegable (Autopista del Sol, IIRSA Centro, Dv. Quilca - La Concordia, Long. de la Sierra T2) u **Otros** para escribir el nombre. Los subtramos de cada concesión también se eligen de una lista (según los listados de la carpeta LISTADO DE SUBTRAMOS); los km y puentes se ingresan por sorteo.
- **Validación**: no se pasa al siguiente punto si faltan datos. Lecturas fuera de 20–70 o temperaturas fuera de 0–40 °C generan una alerta; se puede corregir o confirmar que es correcto.
- **Fotos con fecha y hora**: 2 por puente y 2 por cada punto de 100 m. Botón **Panel fotográfico** en la medición: genera un Word (.docx) por toda la medición o por subtramo.
- Los datos se guardan en el teléfono mientras se escribe. Botón **Respaldo** para guardar una copia (.json) y **Restaurar** para recuperarla.

## Probar sin instalar nada

Abrir `www/index.html` en Chrome (PC o celular). Es un solo archivo y funciona sin internet. En el APK la cámara usa el permiso de cámara de Android; las fotos no se incluyen en el respaldo .json.

## Generar el APK (sin instalar Android Studio)

El APK se compila gratis en GitHub; no hace falta programar.

1. Crear una cuenta en https://github.com (si no se tiene).
2. Crear un repositorio nuevo, **privado** (botón "New"). Nombre sugerido: `pendulo-trrl`.
3. Subir el contenido de esta carpeta al repositorio ("Add file" → "Upload files"): `www`, `src`, `build.py`, `package.json`, `capacitor.config.json`, `.gitignore`, `LEEME.md` y la carpeta oculta `.github` (con `workflows/build-apk.yml`). Si la carpeta `.github` no se sube al arrastrarla, crearla con "Add file" → "Create new file", escribiendo en el nombre `.github/workflows/build-apk.yml` y pegando el contenido del archivo.
4. Ir a la pestaña **Actions** → "Compilar APK" → **Run workflow**. Tarda unos 5 a 10 minutos.
5. Al terminar, abrir la ejecución y descargar **Pendulo-TRRL-APK** (abajo, en "Artifacts"). Es un .zip: descomprimirlo y obtener `app-debug.apk`.
6. Pasar `app-debug.apk` al celular (WhatsApp, Drive o cable) y abrirlo. Android pedirá permitir la instalación de aplicaciones de esta fuente; aceptar.

Cada vez que se cambie algo en `src/`, volver a ejecutar el paso 4.

## Estructura

- `src/app.js` — pantallas y captura.
- `src/xlsx.js` — exportación a Excel y lectura del Excel de sorteo (sin librerías externas).
- `src/docx.js` — panel fotográfico en Word.
- `src/assets/` — estilos, logos y plantillas tomadas de los dos modelos Excel.
- `build.py` — junta todo en `www/index.html`.
