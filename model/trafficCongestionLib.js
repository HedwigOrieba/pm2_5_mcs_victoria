/**
 * @author Hedwig Orieba
 * @version 1.0.0
 */

const axios = require("axios");
const fs = require("fs");
const config = require("config");
const path = require("path");
const mysql = require("mysql2/promise");

class TrafficCongestionManager {
  constructor() {
    this.pool = mysql.createPool({
      host: config.get("host"),
      port: config.get("port"),
      database: config.get("database"),
      user: config.get("username"),
      password: config.get("password"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  /* connection pool record */
  getDbConnectionPool() {
    return this.pool;
  }

  /* corridor table record */
  createCorridorTableRecord(code, name, origin, destination) {
    return {
      corridor_code: code,
      corridor_name: name,
      origin_name: origin,
      destination_name: destination,
    };
  }

  /* traffic observation record */
  async createTrafficObservationRecord(apiResult, id) {
    const durationSeconds = parseInt(
      apiResult.data.routes[0].duration.replace("s", ""),
    );
    const staticDurationSeconds = parseInt(
      apiResult.data.routes[0].staticDuration.replace("s", ""),
    );
    const initTrafficRecord = {
      corridorId: id,
      observedAt: new Date(),
      distanceMeters: apiResult.data.routes[0].distanceMeters,
      durationSeconds,
      staticDurationSeconds,
      trafficPerformanceIndex: Number(
        (durationSeconds / staticDurationSeconds).toFixed(4),
      ),
      routePolyline: apiResult.data.routes[0].polyline.encodedPolyline,
    };

    console.log(initTrafficRecord);
    return initTrafficRecord;
  }

  /* create traffic leg record */
  createTrafficLegRecord(trafficObservationId, apiResult) {
    return apiResult.data.routes[0].legs.map((leg, index) => {
      const durationSeconds = parseInt(leg.duration.replace("s", ""));
      const staticDurationSeconds = parseInt(
        leg.staticDuration.replace("s", ""),
      );
      return {
        trafficObservationId: trafficObservationId,
        legIndex: index + 1,
        distanceMeters: leg.distanceMeters,
        durationSeconds,
        staticDurationSeconds,
        trafficPerformanceIndex: Number(
          (durationSeconds / staticDurationSeconds).toFixed(4),
        ),
        legPolyline: leg.polyline?.encodedPolyline,
      };
    });
  }

  /* register a traffic observationRecord */
  async registerTrafficObservationRecord() {
    try {
      const corridorId = await this.getCorridorId("Jinja_road");
      const apiResult = await this.getCorridorTravelMetrics();
      const pool = this.getDbConnectionPool();
      const record = await this.createTrafficObservationRecord(
        apiResult,
        corridorId,
      );

      console.log(record);

      const [rows, fields] = await pool.execute(
        `INSERT INTO traffic_observations(
        corridor_id,
        observed_at,
        distance_meters,
        duration_seconds,
        static_duration_seconds,
        traffic_performance_index,
        route_polyline
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          record.corridorId,
          record.observedAt,
          record.distanceMeters,
          record.durationSeconds,
          record.staticDurationSeconds,
          record.trafficPerformanceIndex,
          record.routePolyline,
        ],
      );
      const observationId = rows.insertId;
      const legs = await this.createTrafficLegRecord(observationId, apiResult);
      // Insert each legs
      for (const leg of legs) {
        await pool.execute(
          `INSERT INTO traffic_leg_observations(
          traffic_observation_id,
          leg_index,
          distance_meters,
          duration_seconds,
          static_duration_seconds,
          traffic_performance_index,
          leg_polyline
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            leg.trafficObservationId,
            leg.legIndex,
            leg.distanceMeters,
            leg.durationSeconds,
            leg.staticDurationSeconds,
            leg.trafficPerformanceIndex,
            leg.legPolyline ?? null,
          ],
        );
      }
      return { observationId, legsCount: legs.length };
    } catch (ex) {
      console.log(ex);
      return ex.message;
    }
  }

  /* register a corridor to the database */
  async registerCorridorToDb(corridor_code, name, origin, destn) {
    try {
      const isExists = await this.checkIfCorridorExists(corridor_code);
      if (isExists.length === 0) throw new Error("Record already exists");
      const pool = this.getDbConnectionPool();
      const corridorRecord = this.createCorridorTableRecord(
        corridor_code,
        name,
        origin,
        destn,
      );
      const [rows, fields] = await pool.execute(
        `INSERT INTO traffic_corridors (corridor_code,corridor_name, origin_name,destination_name)
        VALUES (?, ?, ?, ?)`,
        [
          corridorRecord.corridor_code,
          corridorRecord.corridor_name,
          corridorRecord.origin_name,
          corridorRecord.destination_name,
        ],
      );

      return [rows, fields];
    } catch (ex) {
      console.log(ex.message);
      return ex.message;
    }
  }

  /* check if corridor does exist */
  async checkIfCorridorExists(corridor_code) {
    const pool = this.getDbConnectionPool();
    const [rows, fields] = await pool.execute(
      `SELECT * FROM traffic_corridors WHERE corridor_code = ?`,
      [corridor_code],
    );

    return fields;
  }

  /* get corridor id */
  async getCorridorId(corridor_code) {
    const pool = this.getDbConnectionPool();
    const [rows, fields] = await pool.execute(
      `SELECT id FROM traffic_corridors WHERE corridor_code = ?`,
      [corridor_code],
    );

    if (rows.length > 0) {
      return rows[0].id;
    } else {
      return null;
    }
  }

  /* create corridor travel metric */
  async getCorridorTravelMetrics() {
    const apiResult = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes?",
      {
        origin: {
          location: {
            latLng: {
              latitude: 0.3473385,
              longitude: 32.6504669,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: 0.3143125,
              longitude: 32.5901891,
            },
          },
        },
        intermediates: [
          {
            location: {
              latLng: {
                latitude: 0.3421426,
                longitude: 32.6357004,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3363581,
                longitude: 32.620327,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.33362,
                longitude: 32.6183955,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3280732,
                longitude: 32.612113,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3248167,
                longitude: 32.6078361,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.323292,
                longitude: 32.6022388,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3183216,
                longitude: 32.5955135,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3161078,
                longitude: 32.5931907,
              },
            },
          },
          {
            location: {
              latLng: {
                latitude: 0.3149136,
                longitude: 32.5912203,
              },
            },
          },
        ],
        travelMode: "DRIVE",
        extraComputations: ["TRAFFIC_ON_POLYLINE"],
        routingPreference: "TRAFFIC_AWARE",
        optimizeWaypointOrder: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": `${config.get("google_apiKey")}`,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.polyline,routes.legs.polyline,routes.travelAdvisory,routes.staticDuration,routes.legs.travelAdvisory,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters",
        },
      },
    );
    return apiResult;
  }

  /** === * Building the traffic converter engine * === **/

  /* create an rounded hourly bucket */
  roundToHourUTC(date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ),
    );
  }

  /* Standardising a record date */
  standardizeAndRound(dateString) {
    const parsedDate = new Date(dateString); // local to UTC
    const standardized = parsedDate.toISOString(); // exact UTC
    const roundedHourlyBucket = this.roundToHourUTC(parsedDate).toISOString(); // hourly bucket
    return { standardized, roundedHourlyBucket };
  }

  // Sumarize Records
  summarizeTrafficGroup(records) {
    if (!records || records.length === 0) return null;

    // Mean speed (distance/duration per record)
    const meanSpeed =
      records.reduce((sum, r) => {
        return sum + r.distance_meters / r.duration_seconds;
      }, 0) / records.length;

    // Mean duration
    const meanDuration =
      records.reduce((sum, r) => sum + r.duration_seconds, 0) / records.length;

    // Mean TPI
    const meanTPI =
      records.reduce((sum, r) => sum + r.traffic_performance_index, 0) /
      records.length;

    // Finding min and max TPI with IDs
    let minTPI = Infinity,
      minTPIId = null;
    let maxTPI = -Infinity,
      maxTPIId = null;

    records.forEach((r) => {
      if (r.traffic_performance_index < minTPI) {
        minTPI = r.traffic_performance_index;
        minTPIId = r.id;
      }
      if (r.traffic_performance_index > maxTPI) {
        maxTPI = r.traffic_performance_index;
        maxTPIId = r.id;
      }
    });

    return {
      count: records.length,
      meanSpeed,
      meanDuration,
      meanTPI,
      minTPI,
      minTPIId,
      maxTPI,
      maxTPIId,
    };
  }

  // Group records with the same hour
  groupByHour(records) {
    const grouped = {}; // this is an object (dictionary)

    records.forEach((r) => {
      const date = new Date(r.observed_at);

      // Round down to the hour in UTC
      const hourKey = new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          date.getUTCHours(),
        ),
      ).toISOString();

      // If this hourKey doesn’t exist yet, create an empty array
      if (!grouped[hourKey]) {
        grouped[hourKey] = [];
      }

      // Push the record into the array for that hourKey
      grouped[hourKey].push(r);
    });

    return grouped;
  }

  // summarize by hour
  summarizeByHour(records) {
    const grouped = this.groupByHour(records);
    return Object.entries(grouped).map(([hour, groupRecords]) => {
      return {
        hour,
        summary: this.summarizeTrafficGroup(groupRecords),
      };
    });
  }

  // merge airQo dataset readings to the returned summary dataset
  //   mergeTrafficAndAirQo(trafficSummary, airQoData) {
  //     // Build quick lookup maps for efficiency
  //     const trafficMap = new Map(trafficSummary.map((t) => [t.hour, t.summary]));
  //     const airqoMap = new Map(
  //       airQoData.map((a) => [new Date(a.datetime).toISOString(), a]),
  //     );

  //     // Collect all unique hours from both datasets
  //     const allHours = Array.from(
  //       new Set([
  //         ...trafficSummary.map((t) => t.hour),
  //         ...airQoData.map((a) => new Date(a.datetime).toISOString()),
  //       ]),
  //     ).sort();

  //     // Merge both sides
  //     return allHours.map((hourKey) => {
  //       const traffic = trafficMap.get(hourKey);
  //       const airqo = airqoMap.get(hourKey);

  //       return {
  //         hour: hourKey,
  //         pm25: airqo ? airqo.pm2_5_calibrated_value : null,
  //         temperature: airqo ? airqo.temperature : null,
  //         humidity: airqo ? airqo.humidity : null,
  //         site: airqo ? airqo.site_name : null,
  //         ...(traffic || {
  //           count: null,
  //           meanSpeed: null,
  //           meanDuration: null,
  //           meanTPI: null,
  //           minTPI: null,
  //           minTPIId: null,
  //           maxTPI: null,
  //           maxTPIId: null,
  //         }),
  //       };
  //     });
  //   }

  mergeTrafficAndAirQo(trafficSummary, airQoData) {
    const trafficMap = new Map(trafficSummary.map((t) => [t.hour, t.summary]));

    // Round AirQo datetime to hourly bucket
    const roundToHourUTC = (dateString) => {
      const d = new Date(dateString);
      d.setMinutes(0, 0, 0);
      return d.toISOString();
    };

    const airqoMap = new Map(
      airQoData.map((a) => [roundToHourUTC(a.datetime), a]),
    );

    const allHours = Array.from(
      new Set([
        ...trafficSummary.map((t) => t.hour),
        ...airQoData.map((a) => roundToHourUTC(a.datetime)),
      ]),
    ).sort();

    return allHours.map((hourKey) => {
      const traffic = trafficMap.get(hourKey);
      const airqo = airqoMap.get(hourKey);

      return {
        hour: hourKey,
        pm25: airqo ? airqo.pm2_5_calibrated_value : null,
        temperature: airqo ? airqo.temperature : null,
        humidity: airqo ? airqo.humidity : null,
        site: airqo ? airqo.site_name : null,
        count: traffic ? traffic.count : null,
        meanSpeed: traffic ? traffic.meanSpeed : null,
        meanDuration: traffic ? traffic.meanDuration : null,
        meanTPI: traffic ? traffic.meanTPI : null,
        minTPI: traffic ? traffic.minTPI : null,
        minTPIId: traffic ? traffic.minTPIId : null,
        maxTPI: traffic ? traffic.maxTPI : null,
        maxTPIId: traffic ? traffic.maxTPIId : null,
      };
    });
  }

  // clean the merged script
  cleanData() {
    const mergedFile = path.join(__dirname, "../data", "merged_record.json");
    const rawData = fs.readFileSync(mergedFile, "utf8");
    const records = JSON.parse(rawData);
    return records
      .filter(
        (d) => d.pm25 !== null && d.temperature !== null && d.humidity !== null,
      ) // drop rows missing key values
      .map((d) => {
        return {
          // Ensure ISO timestamp
          hour: new Date(d.hour).toISOString(),

          // Round numeric values
          pm25: Number(d.pm25.toFixed(2)),
          temperature: Number(d.temperature.toFixed(2)),
          humidity: Number(d.humidity.toFixed(2)),

          // Encode site as string
          site: d.site ? d.site.trim() : "Unknown",

          // Replace traffic nulls with 0 (or keep null if you prefer imputation later)
          meanSpeed: d.meanSpeed || 0,
          meanDuration: d.meanDuration || 0,
          meanTPI: d.meanTPI || 0,
          minTPI: d.minTPI || 0,
          maxTPI: d.maxTPI || 0,
        };
      });
  }

  // standardise data
  standardiseAirQoDataset(filePath) {
    const rawData = fs.readFileSync(filePath, "utf8");
    const records = JSON.parse(rawData);

    // Round timestamp down to the hour in UTC
    const roundToHourUTC = (dateString) => {
      const d = new Date(dateString);
      d.setMinutes(0, 0, 0);
      return d.toISOString();
    };

    // Helper to safely convert numbers
    const safeNumber = (val) =>
      typeof val === "number" ? Number(val.toFixed(2)) : null;

    // Handle both {data:[...]} or plain array
    const dataset = records.data || records;

    const cleaned = dataset
      .filter(
        (d) =>
          (d.pm25 ?? d.pm2_5_calibrated_value) !== null &&
          (d.temperature ?? d.temp) !== null &&
          (d.humidity ?? d.hum) !== null,
      )
      .map((d) => ({
        hour: roundToHourUTC(d.hour || d.datetime),
        pm25: safeNumber(d.pm25 ?? d.pm2_5_calibrated_value),
        temperature: safeNumber(d.temperature ?? d.temp),
        humidity: safeNumber(d.humidity ?? d.hum),
        site:
          d.site || d.site_name ? (d.site || d.site_name).trim() : "Unknown",
      }));

    return cleaned;
  }
} //end class
module.exports = TrafficCongestionManager;
