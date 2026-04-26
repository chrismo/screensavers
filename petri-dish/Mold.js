class Mold {
  constructor() {
    // this.x = random(width);
    // this.y = random(height);
    this.x = random(width / 2 - 20, width / 2 + 20);
    this.y = random(height / 2 - 20, height / 2 + 20);
    this.r = 0.5;

    this.heading = random(360);
    this.vx = cos(this.heading);
    this.vy = sin(this.heading);

    this.rSensorPos = createVector(0, 0);
    this.lSensorPos = createVector(0, 0);
    this.fSensorPos = createVector(0, 0);
  }

  update() {
    this.vx = cos(this.heading);
    this.vy = sin(this.heading);

    this.x = (this.x + this.vx * moldSpeed + width) % width;
    this.y = (this.y + this.vy * moldSpeed + height) % height;

    this.getSensorPos(this.rSensorPos, this.heading + sensorAngle);
    this.getSensorPos(this.lSensorPos, this.heading - sensorAngle);
    this.getSensorPos(this.fSensorPos, this.heading);

    let index, l, r, f;
    index = 4 * (d * floor(this.rSensorPos.y)) * (d * width) + 4 * (d * floor(this.rSensorPos.x));
    r = pixels[index];

    index = 4 * (d * floor(this.lSensorPos.y)) * (d * width) + 4 * (d * floor(this.lSensorPos.x));
    l = pixels[index];

    index = 4 * (d * floor(this.fSensorPos.y)) * (d * width) + 4 * (d * floor(this.fSensorPos.x));
    f = pixels[index];

    if (f > l && f > r) {
      this.heading += 0;
    } else if (f < l && f < r) {
      if (random(1) < 0.5) {
        this.heading += rotAngle;
      } else {
        this.heading -= rotAngle;
      }
    } else if (l > r) {
      this.heading += -rotAngle;
    } else if (r > l) {
      this.heading += rotAngle;
    }
  }

  display() {
    noStroke();
    fill(255);
    ellipse(this.x, this.y, this.r * 2, this.r * 2);
  }

  getSensorPos(sensor, angle) {
    sensor.x = (this.x + sensorDist * cos(angle) + width) % width;
    sensor.y = (this.y + sensorDist * sin(angle) + height) % height;
  }
}
