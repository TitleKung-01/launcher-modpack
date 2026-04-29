# Modpack Source

วางไฟล์ม็อดไว้ใน `modpack/mods/` และไฟล์ config ไว้ใน `modpack/config/`

ทุกครั้งที่กดปุ่มเริ่มเกม Launcher จะทำงานดังนี้อัตโนมัติ:

1. Sync ไฟล์จาก `modpack/mods/` ไปที่ `<launcher root>/mods/`
2. Sync ไฟล์จาก `modpack/config/` ไปที่ `<launcher root>/config/`
3. ลบไฟล์ปลายทางที่ไม่มีอยู่ใน source แล้ว (auto-clean)
4. สร้างไฟล์รายการม็อดที่ `<launcher root>/mod-list.json`

ค่า `<launcher root>` ตั้งได้ใน `src/main/infrastructure/config/launcherConfig.js`
