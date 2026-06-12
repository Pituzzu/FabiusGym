#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

const char* ssid = "Vodafone-C70963959";
const char* password = "gPhcnNnyt3yams9G";

// URL del tuo database (assicurati che finisca con .json)
const char* firebase_url = "https://fabiusgym-default-rtdb.firebaseio.com/ultimo_accesso.json?auth=AIzaSyD1oLQ7ooISkQxVcAEs2QUCiIzL3e6oBew";

#define RST_PIN 4  
#define SS_PIN  5  
MFRC522 mfrc522(SS_PIN, RST_PIN);
String lastUid = "";
unsigned long lastUidTime = 0;
const unsigned long duplicateWindowMs = 1500;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK!");
}

void loop() {
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String uidString = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      uidString += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
      uidString += String(mfrc522.uid.uidByte[i], HEX);
    }
    uidString.toUpperCase();
    unsigned long now = millis();
    if (uidString == lastUid && now - lastUidTime < duplicateWindowMs) {
      mfrc522.PICC_HaltA();
      return;
    }
    lastUid = uidString;
    lastUidTime = now;

    Serial.println("Card: " + uidString);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      // Firebase RTDB accetta stringhe racchiuse tra virgolette via PUT
      String jsonData = "\"" + uidString + "\"";
      
      http.begin(firebase_url);
      int httpResponseCode = http.PUT(jsonData);

      if (httpResponseCode > 0) {
        Serial.print("Inviato! Codice risposta: ");
        Serial.println(httpResponseCode);
      } else {
        Serial.print("Errore invio: ");
        Serial.println(http.errorToString(httpResponseCode).c_str());
      }
      http.end();
    }
    
    mfrc522.PICC_HaltA();
    delay(2000);
  }
}
