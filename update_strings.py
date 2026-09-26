import re

with open('src/features/frontdesk/i18n/strings.ts', 'r', encoding='utf-8') as f:
    c = f.read()

# Add English strings
c = c.replace('attachViewFailed: "Could not open attachment",', 'attachViewFailed: "Could not open attachment",\n    attachZoomIn: "Zoom In",\n    attachZoomOut: "Zoom Out",\n    attachZoomReset: "Reset Zoom",')

# Add Hinglish strings
c = c.replace('attachViewFailed: "Attachment nahi khul paya",', 'attachViewFailed: "Attachment nahi khul paya",\n    attachZoomIn: "Zoom In",\n    attachZoomOut: "Zoom Out",\n    attachZoomReset: "Reset Zoom",')

with open('src/features/frontdesk/i18n/strings.ts', 'w', encoding='utf-8') as f:
    f.write(c)
