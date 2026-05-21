#include <SoftwareSerial.h>
#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// Bluetooth
SoftwareSerial BT(10, 11);

// Pins
int soilPin = A0;
int relayPin = 7;

// Soil threshold
int dryThreshold = 700;

void setup() {

  Serial.begin(9600);

  BT.begin(9600);

  dht.begin();

  pinMode(relayPin, OUTPUT);

  // Pump OFF initially
  digitalWrite(relayPin, HIGH);

  Serial.println();
  Serial.println("====================================");
  Serial.println("   SMART AGRO SYSTEM STARTED");
  Serial.println("====================================");
}

void loop() {

  // Read sensors
  int soilValue = analogRead(soilPin);

  float temp = dht.readTemperature();

  float hum = dht.readHumidity();

  // =========================
  // HEADER
  // =========================

  Serial.println();
  Serial.println("====================================");

  // =========================
  // SENSOR VALUES
  // =========================

  Serial.print("Soil Moisture : ");
  Serial.println(soilValue);

  Serial.print("Temperature   : ");
  Serial.print(temp);
  Serial.println(" C");

  Serial.print("Humidity      : ");
  Serial.print(hum);
  Serial.println(" %");

  // =========================
  // SOIL STATUS
  // =========================

  if (soilValue > dryThreshold) {

    Serial.println();
    Serial.println("STATUS : DRY SOIL");

    Serial.println("PUMP   : ON");

    // Pump ON
    digitalWrite(relayPin, LOW);

    delay(5000);

    // Pump OFF
    digitalWrite(relayPin, HIGH);

    Serial.println("PUMP   : OFF");

    Serial.println("Waiting 10 seconds...");

    delay(10000);

  } else {

    Serial.println();
    Serial.println("STATUS : WET SOIL");

    Serial.println("PUMP   : OFF");

    digitalWrite(relayPin, HIGH);

    delay(3000);
  }

  Serial.println("====================================");

  // =========================
  // BLUETOOTH OUTPUT
  // =========================

  BT.print("Soil:");
  BT.print(soilValue);

  BT.print(" Temp:");
  BT.print(temp);

  BT.print(" Humidity:");
  BT.println(hum);
}
