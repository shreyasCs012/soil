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

void setup() {#include <SoftwareSerial.h>
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

  Serial.println("Smart Agro System Started");
}

void loop() {

  // Read sensors
  int soilValue = analogRead(soilPin);

  float temp = dht.readTemperature();

  float hum = dht.readHumidity();

  // =========================
  // DISPLAY DATA
  // =========================

  Serial.print("Soil moisture:");
  Serial.print(soilValue);

  Serial.print(" Temperature:");
  Serial.print(temp);

  Serial.print(" Humidity:");
  Serial.println(hum);

  BT.print("Soil moisture:");
  BT.print(soilValue);

  BT.print(" Temperature:");
  BT.print(temp);

  BT.print(" Humidity:");
  BT.println(hum);

  // =========================
  // SMART IRRIGATION
  // =========================

  while (soilValue > dryThreshold) {

    Serial.println("Soil Dry -> Pump ON");

    // Pump ON
    digitalWrite(relayPin, LOW);

    // Water for 5 seconds
    delay(5000);

    // Pump OFF
    digitalWrite(relayPin, HIGH);

    Serial.println("Pump OFF");

    // Wait 10 seconds
    Serial.println("Waiting 10 seconds...");

    delay(10000);

    // Check soil again
    soilValue = analogRead(soilPin);

    Serial.print("New Soil Value: ");
    Serial.println(soilValue);
  }

  Serial.println("Soil Wet -> No Water Needed");

  delay(3000);
}

  Serial.begin(9600);

  BT.begin(9600);

  dht.begin();

  pinMode(relayPin, OUTPUT);

  // Pump OFF initially
  digitalWrite(relayPin, HIGH);

  Serial.println("Smart Agro System Started");
}

void loop() {

  // Read sensors
  int soilValue = analogRead(soilPin);

  float temp = dht.readTemperature();

  float hum = dht.readHumidity();

  // =========================
  // DISPLAY DATA
  // =========================

  Serial.print("Soil moisture:");
  Serial.print(soilValue);

  Serial.print(" Temperature:");
  Serial.print(temp);

  Serial.print(" Humidity:");
  Serial.println(hum);

  BT.print("Soil moisture:");
  BT.print(soilValue);

  BT.print(" Temperature:");
  BT.print(temp);

  BT.print(" Humidity:");
  BT.println(hum);

  // =========================
  // SMART IRRIGATION
  // =========================

  while (soilValue > dryThreshold) {

    Serial.println("Soil Dry -> Pump ON");

    // Pump ON
    digitalWrite(relayPin, LOW);

    // Water for 5 seconds
    delay(5000);

    // Pump OFF
    digitalWrite(relayPin, HIGH);

    Serial.println("Pump OFF");

    // Wait 10 seconds
    Serial.println("Waiting 10 seconds...");

    delay(10000);

    // Check soil again
    soilValue = analogRead(soilPin);

    Serial.print("New Soil Value: ");
    Serial.println(soilValue);
  }

  Serial.println("Soil Wet -> No Water Needed");

  delay(3000);
}
