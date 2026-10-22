# ผลวิเคราะห์ APK "Rain Viewer v6.5 (Premium)" และแหล่งข้อมูลฟรีที่ใช้ได้

วันที่วิเคราะห์: 2026-10-22

## 1. แอปต้นฉบับดึงข้อมูลจากไหน

ไฟล์ APK เป็นเวอร์ชันดัดแปลง (มีสตริง `liteapks.com` และ `bin/mt/signature/KillerApplication` ซึ่งเป็นตัวข้ามการตรวจลายเซ็น) ของแอป `com.lucky_apps.rainviewer` โค้ดหลักถูก obfuscate และ string ของ API ถูกเข้ารหัส

สิ่งที่ถอดออกมาได้:

| ส่วน | ที่พบใน APK | สถานะสำหรับเรา |
|---|---|---|
| API หลักของแอป | `api.rainviewer.com` ผ่านคลาส `AuthorizationRestApi`, `ForecastRestApi`, `MapsRestApi`, `AlertsApi`, `StormTracksApi` และ native lib `librv-cs-library.so` สำหรับเซ็นคำขอ | **ส่วนตัว / ต้องมี secret** ห้ามใช้ |
| ข้อมูลพยากรณ์ (ชั่วโมง/รายวัน/AI summary/AQI) | `ForecastGatewayImpl.fetchForecast`, `fetchLocationAiSummary` ผ่าน API ส่วนตัว | ส่วนตัว ห้ามใช้ |
| ไทล์เรดาร์ | รูปแบบ `/v2/{layer}/{ts}/{size}/{z}/{x}/{y}/255/{color}_1_1_0.webp` บน `tilecache` | มีเวอร์ชันสาธารณะ (ดูข้อ 2) |
| เมทาดาต้าเรดาร์ | `cdn.rainviewer.com/api/sources.json`, `radars.json`, `images.json` | สาธารณะ |
| แผนที่พื้นหลัง | `maps.rainviewer.com/styles/m2*/style.json` (MapLibre) | ของ RainViewer เอง ไม่ควรใช้ |
| ค้นหาสถานที่ | Google Places API key ฝังอยู่ใน `values/api_keys.xml` | ของเขา ห้ามใช้ |

ไม่พบผู้ให้บริการพยากรณ์บุคคลที่สาม (Open-Meteo, OpenWeatherMap ฯลฯ) ใน APK เลย ข้อมูลพยากรณ์ทั้งหมดมาจากเซิร์ฟเวอร์ RainViewer เอง

## 2. RainViewer Public API (ฟรี) ทดสอบจริงวันนี้

Endpoint: `https://api.rainviewer.com/public/weather-maps.json`

- ตอบ 200, มี `access-control-allow-origin: *` จึงเรียกจากเบราว์เซอร์ได้โดยตรง
- `radar.past` มี 13 เฟรม ห่างกัน 10 นาที (ย้อนหลัง 2 ชั่วโมง)
- `radar.nowcast` = **ว่าง** และ `satellite.infrared` = **ว่าง**
- ไทล์: `{host}{path}/256/{z}/{x}/{y}/2/1_1.png` ตอบ 200 พร้อม CORS
- ซูม 8 ขึ้นไปได้ไฟล์ขนาดเท่ากันทุกไทล์ (1,370 ไบต์) แปลว่าเป็นไทล์เปล่า ใช้ได้จริงถึง **ซูม 7**
- `sources.json` ยืนยันว่ามีเรดาร์ของ Thai Meteorological Department, Malaysia, Singapore, Vietnam

เงื่อนไขจากหน้า Transition FAQ ของ RainViewer:

- 1 ม.ค. 2026 ตัด nowcast, ดาวเทียม IR, สีทุกแบบยกเว้น Universal Blue, จำกัดซูม 7, จำกัด 100 คำขอ/IP/นาที
- ใช้ได้เฉพาะ personal และ educational, ไม่มี SLA, ขอให้ใส่เครดิตลิงก์กลับไป rainviewer.com

สรุป: ใช้เป็น "เรดาร์ย้อนหลัง 2 ชม." ได้ฟรี แต่ **ทำนายล่วงหน้าไม่ได้แล้ว** ต้องหาแหล่งอื่นหรือคำนวณเอง

## 3. แหล่งข้อมูลฟรีอื่นที่ทดสอบแล้วใช้ได้

### Open-Meteo (พยากรณ์ล่วงหน้า)
- ฟรีสำหรับใช้ส่วนตัว/ไม่หารายได้ ไลเซนส์ CC-BY 4.0 ต้องใส่เครดิต
- จำกัด 10,000 คำขอ/วัน, 5,000/ชม., 600/นาที ต่อ IP
- มี CORS `*` เรียกจากเบราว์เซอร์ได้
- ส่งหลายพิกัดในคำขอเดียวได้: ทดสอบ 100 จุด ใช้ 2.8 วินาที, 400 จุด ใช้ 7.8 วินาที
- `minutely_15=precipitation` ใช้ได้ในไทย แต่เป็นค่าที่ interpolate จากรายชั่วโมง (ข้อมูล 15 นาทีจริงมีแค่ยุโรปกลางและอเมริกาเหนือ)
- สำหรับไทยใช้โมเดล global: ICON, GFS, ECMWF IFS ความละเอียด 9-25 กม.
- มี `precipitation_probability`, `weather_code` รายชั่วโมง ล่วงหน้าได้ถึง 16 วัน

### NASA GIBS (ดาวเทียม)
- ฟรี ไม่มีข้อจำกัด (`Fees: none`, `AccessConstraints: none`), CORS `*`
- ไทล์ WMTS แบบ Web Mercator ใช้กับ Leaflet/MapLibre ได้ทันที
- เลเยอร์ที่เกี่ยวข้อง: `IMERG_Precipitation_Rate_30min` (ฝนจากดาวเทียมทุก 30 นาที แต่ช้ากว่าจริง ~4 ชม.), `Himawari_AHI_Band13_Clean_Infrared` (เมฆ IR ครอบคลุมไทย)

### กรมอุตุนิยมวิทยา (TMD)
- รูปเรดาร์รวมทั่วประเทศ `https://weather.tmd.go.th/svp/svp120_latest.jpg` ดึงได้ (273 KB) แต่ไม่มี CORS และไม่มี georeference ประกาศไว้
- Open Data API ที่ `data.tmd.go.th/api` เข้าจากเครื่องนี้ไม่ได้ (TLS handshake ล้มเหลว) ต้องทดสอบจากเครื่องอื่น และต้องสมัคร uid/ukey
- ไม่พบเงื่อนไขการนำรูปเรดาร์ไปแสดงซ้ำ ควรขอ TMD ก่อนถ้าจะใช้

### แผนที่พื้นหลังฟรี
- OpenStreetMap raster tiles ใช้ได้สำหรับแอปส่วนตัวปริมาณน้อย (ต้องมี attribution)
- CARTO basemaps (light/dark) ฟรีสำหรับใช้ไม่หารายได้
- OpenFreeMap vector tiles ฟรี ไม่จำกัด ใช้กับ MapLibre

## 4. ทางเลือกในการ "ทำนายฝนล่วงหน้าบนแผนที่"

| วิธี | ล่วงหน้า | ความละเอียด | ต้นทุน | หมายเหตุ |
|---|---|---|---|---|
| A. Optical-flow nowcast จากเรดาร์ RainViewer 13 เฟรมที่ผ่านมา คำนวณในเบราว์เซอร์ | 30-60 นาที | ระดับไทล์ซูม 7 (~1 กม./พิกเซล ที่ละติจูดไทย) | ฟรี | เหมือนวิธีที่ RainViewer เคยทำ; แม่นช่วงสั้น |
| B. กริด Open-Meteo 15 นาที/รายชั่วโมง ทาสีเป็น heatmap บนแผนที่ | 1-48 ชม.+ | 9-25 กม. | ฟรี | ครอบคลุมทุกพื้นที่ ไม่ต้องมีเรดาร์ |
| C. ผสม A + B | 0-48 ชม. | ดีที่สุด | ฟรี | แนะนำ: ใช้ A สำหรับ 0-1 ชม. แล้วค่อยเปลี่ยนเป็น B |

## 5. ข้อจำกัดที่ต้องบอกผู้ใช้
- ห้ามหารายได้ (โฆษณา/สมัครสมาชิก) ถ้าใช้ RainViewer public API และ Open-Meteo แบบฟรี
- ต้องแสดงเครดิต RainViewer, Open-Meteo (CC-BY 4.0), NASA GIBS, OpenStreetMap
- RainViewer ไม่รับประกันว่าจะให้บริการต่อ ควรออกแบบให้สลับไปใช้ GIBS/Open-Meteo อย่างเดียวได้
