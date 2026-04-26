// Brightness "commit" model
// -------------------------
// Each mold tracks a smoothed [0..1] indicator of whether it's currently
// committing to its heading (going straight) or turning to chase a brighter
// trail. Brightness on the trail map maps from this — committed runs draw
// bright, turning molds draw dim.
//
// IMPORTANT: this isn't purely cosmetic. The trail map is what sensors read
// the next frame, so dim trails in turning zones make those zones less
// attractive to other molds, adding positive feedback toward established
// flow channels. Patterns become more channelized than the unweighted
// (constant-brightness) version.
const COMMIT_SMOOTH = 0.08;     // EMA pull-rate per frame; ~8-frame half-life
const BRIGHTNESS_MIN = 30;      // brightness when fully turning
const BRIGHTNESS_MAX = 100;     // brightness when fully committed

class Mold {
  constructor() {
    this.x = random(width / 2 - 20, width / 2 + 20);
    this.y = random(height / 2 - 20, height / 2 + 20);
    this.r = 0.5;

    this.heading = random(360);
    this.vx = cos(this.heading);
    this.vy = sin(this.heading);

    this.rSensorPos = createVector(0, 0);
    this.lSensorPos = createVector(0, 0);
    this.fSensorPos = createVector(0, 0);

    this.commit = 1;
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
    r = pixels[index] + pixels[index + 1] + pixels[index + 2];

    index = 4 * (d * floor(this.lSensorPos.y)) * (d * width) + 4 * (d * floor(this.lSensorPos.x));
    l = pixels[index] + pixels[index + 1] + pixels[index + 2];

    index = 4 * (d * floor(this.fSensorPos.y)) * (d * width) + 4 * (d * floor(this.fSensorPos.x));
    f = pixels[index] + pixels[index + 1] + pixels[index + 2];

    let turning = true;
    if (f > l && f > r) {
      this.heading += 0;
      turning = false;
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
    this.updateCommit(turning);
  }

  display() {
    noStroke();
    fill(0, 0, this.brightness());
    ellipse(this.x, this.y, this.r * 2, this.r * 2);
  }

  updateCommit(turning) {
    const target = turning ? 0 : 1;
    this.commit = this.commit * (1 - COMMIT_SMOOTH) + target * COMMIT_SMOOTH;
  }

  brightness() {
    return BRIGHTNESS_MIN + this.commit * (BRIGHTNESS_MAX - BRIGHTNESS_MIN);
  }

  getSensorPos(sensor, angle) {
    sensor.x = (this.x + sensorDist * cos(angle) + width) % width;
    sensor.y = (this.y + sensorDist * sin(angle) + height) % height;
  }
}
