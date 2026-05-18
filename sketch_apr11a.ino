#include <SoftwareSerial.h>
#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

SoftwareSerial BT(10, 11);

int soilPin = A0;
int phPin = A1;
int relayPin = 7;

void setup() {

  Serial.begin(9600);

  BT.begin(9600);

  dht.begin();

  pinMode(relayPin, OUTPUT);

  digitalWrite(relayPin, HIGH);

  Serial.println("Bluetooth Working");
}

void loop() {

  int soilValue = analogRead(A0);

  int phValue = analogRead(A1);

  float temp = dht.readTemperature();

  float hum = dht.readHumidity();

  BT.print("Soil:");
  BT.print(soilValue);

  BT.print(",Temp:");
  BT.print(temp);

  BT.print(",Humidity:");
  BT.print(hum);

  BT.print(",pH:");
  BT.println(phValue);

  Serial.print("Soil:");
  Serial.print(soilValue);

  Serial.print(" Temp:");
  Serial.print(temp);

  Serial.print(" Humidity:");
  Serial.print(hum);

  Serial.print(" pH:");
  Serial.println(phValue);

  delay(3000);
}