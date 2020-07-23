/// <reference path="typings/node/node.d.ts"/>
'use strict';

var async = require('async'),
  moment = require('moment-timezone'),
  fs = require('fs'),
  readline = require('readline'),
  MongoClient = require('mongodb').MongoClient,
  mongo = require('./mongo.js'),
  cleanDGM = require('./utils.js').cleanDGM;

var mongourl = mongo.getMongoUrl();
var dbname = mongo.getMongoDbName();

var humanize = require('./humanize.json');

// Saves a block (chunk) of data
// Used by rickshaw aggregation
var saveBlock = function(map, row, lastTime, num, dt) {
  for (var col in row) {
    if (map[col]) {
      if (row[col] >= 0 && num >= 0) {
        map[col].push({
          x: parseInt(lastTime.format('X'), 10),
          y: row[col] / num * dt
        });
      } else {
        console.warn(lastTime + ': ' + row[col] + ' ' + num);
      }
    } else {
      map[col] = [ {
        x: parseInt(lastTime.format('X'), 10),
        y: row[col] / num * dt
      } ];
    }
  }
};

var toRickshaw = function(client, cursor, duration, units, res, cb) {

  // build a map of columns to data
  var map = {};
  
  var lastTime = undefined;
  var row = {};
  var num = 0;
  
  var reset;
  var dt = 1; // for bar graphs, integrate.

  if (duration > 1000*60*60*24*7) { // one week
    // grouped by hour
  
    // power -> energy
    for (var u in units) {
      if (units[u] == 'kW') {
        units[u] = 'kWh';
      }
    }
    
    // this is separate from the mongodb aggregation code because of daylight savings
    if (duration > 1000*60*60*24*7*4) { // 1 month
      reset = ['millisecond', 'second', 'minute', 'hour']; // group by day
      dt *= 24;
      
      if (duration > 1000*60*60*24*7*4*6) { // 6 months
        reset.push('day'); // group by week
        dt *= 7;

        if (duration > 1000*60*60*24*366) { // 1 (leap) year
          reset.push('date'); // group by month
          dt *= 30.5 / 7;
        }
      }
    } 
  }

  cursor.forEach(function(doc) {
    
    var time;
    
    if (doc.time) {
      time = moment.tz(doc.time, 'America/New_York');
    } else if (doc._id) { // aggregate cursor overloads _id
      doc._id.month -= 1;
      time = moment.tz(doc._id, 'UTC').tz('America/New_York');
    } else {
      return;
    }
    
    if (reset === undefined) {
      for (var col in doc) {
        if (col == 'time' || col == '_id')
          continue;
        
        if (map[col]) {
          map[col].push({
            x : parseInt(time.format('X'), 10),
            y : doc[col] * dt
          });
        } else {
          map[col] = [ {
            x : parseInt(time.format('X'), 10),
            y : doc[col] * dt
          } ];
        }
      }
    } else {

      for (var r in reset) {
        if (reset[r] == 'date') {
          time.set(reset[r], 1); // date of month is 1-index
        } else {
          time.set(reset[r], 0);
        }
      }

      if (lastTime) {
        // new block
        if (!time.isSame(lastTime)) {
          saveBlock(map, row, lastTime, num, dt);
          
          for (var col in row) {
            row[col] = doc[col];
          }
          
          // switch to new block
          lastTime = time;
          num = 1;
        } else { // same block
          var bad = '';
          for (var col in row) {
            if (typeof doc[col] == 'number' && isFinite(doc[col])) {
              row[col] += doc[col];
            } else if (doc[col]) {
              bad += ' ' + col + ' == ' + doc[col];
            }
          }
          if (bad.length > 0) {
            console.warn(time + ':' + bad);
          }
          num++;
        }
      } else {
        lastTime = time;
        num = 1;
        
        for (var col in doc) {
          if (col == 'time' || col == '_id')
            continue;
          
          row[col] = doc[col];
        }
      }
    }
  }, function(err) {
    client.close();
      
    if (err) {
      cb(err);
    } else {
      
      // Save last block
      saveBlock(map, row, lastTime, num, dt);
      
      // convert map into list
      var list = [];
      
      for (var key in map) {
        list.push({
          name : humanize[key] ? humanize[key] : key,
          id : key,
          unit: units[key], 
          data : map[key]
        });
      }
      cb(null, list);
    }
  });
};

var toCSV = function(client, cursor, duration, units, res, callback) {
  // creates a csv file
  
  var csv = '';
  var header = [];

  cursor.forEach(function(doc) {
    if (header.length == 0) {
      header.push('time');
      
      if (units) {
        for (var unit in units) {
          header.push(unit);
        }
      } else {
        for (var col in doc) {
          if (col == 'time' || col == '_id')
            continue;
          header.push(col);
        }
      }

      if (res) {
        res.write(header.toString());
      } else {
        csv += header.toString();
      }
    }
    
    var row = [];
    
    for (var h in header) {
      if (header[h] == 'time') {
        row.push(moment(doc[header[h]]).tz('America/New_York').format('DD-MMM-YY HH:mm:ss'));
      } else {
        row.push(doc[header[h]]);
      }
    }
    
    if (row) {
      if (res) {
        res.write('\n' + row.toString());
      } else {
        csv += '\n' + row.toString();
      }
    }
  }, function(err) {
    client.close();

    if (err) {
      callback(err);
    } else if (res) {
      callback(null);
    } else {
      callback(null, csv);
    }
  });
};

var diff = function(db, cursor, duration, units, callback) {
  var first, last;

  cursor.forEach(function(doc) {
    if (first === undefined) {
      first = doc;
    }

    last = doc;
  }, function(err) {
    db.close();

    if (err) {
      callback(err);
    } else {
      var diff = {};

      for (var col in last) {
        if (col != '_id') {
          diff[col] = last[col] - first[col];
        }
      }

      callback(null, diff);
    }
  });
};

var toArray = function(db, cursor, duration, units, res, callback) {
  // creates a map

  cursor.toArray(function(err, results) {
    db.close();
    callback(err, results);
  });
};

var getLatest = function(dgm, callback) {
  // Gets the last set of data from the database
  
  /* Connect to the DB and auth */
  MongoClient.connect(mongourl, function(err, client) {
    if (err) {
      callback(err);
    } else {
      const db = client.db(dbname);
      var collection = db.collection(cleanDGM(dgm));
    
      // get the time of the newest datapoint in the database
      collection.find().sort({time: -1}).limit(1).next(function(err, item) {
        client.close();
        callback(err, item);
      });
    }
  });
};

var getProjectionAndUnits = function(db, dgm, desired, callback) {

  if (desired == 'all') {
    // get units
    db.collection('meta_' + cleanDGM(dgm)).find().toArray(function(err, variables) {
      if (!err && variables) {
        var unit = {};

        for (var i in variables) {
          if (variables[i].name && variables[i].name.indexOf('@') < 0) {
            unit[variables[i].name] = variables[i].unit;
          }
        }

        callback(null, null, unit);
      } else {
        if (err) {
          console.warn(err);
          callback(err);
        } else {
          console.warn('error getting all fields from ' + dgm);
          callback('error getting all fields from ' + dgm);
        }
      }
    });
  } else {
    // Pick variables to retrieve
    if (desired && desired.length > 0) {
      // get units
      db.collection('meta_' + cleanDGM(dgm)).find({name: { $in: desired }}, {name: true, unit: true}).toArray(function(err, variables) {
        if (!err && variables && variables.length > 0) {
          var projection = {time: true};
          var unit = {};

          for (var i in variables) {
            if (variables[i].name) {
              projection[variables[i].name] = true;
              unit[variables[i].name] = variables[i].unit;
            }
          }

          callback(null, projection, unit);
        } else {
          if (err) {
            console.warn(err);
            callback(err);
          } else {
            console.warn('error getting units from ' + dgm);
            callback('error getting units from ' + dgm);
          }
        }
      });
    } else {
      // get the variables that have kW
      db.collection('meta_' + cleanDGM(dgm)).find({unit: 'kW'}, {name: true}).toArray(function(err, variables) {
        if (!err && variables) {
          var projection = {time: true};
          var unit = {};

          for (var i in variables) {
            if (variables[i].name && variables[i].name.indexOf('@') < 0) {
              projection[variables[i].name] = true;
              unit[variables[i].name] = 'kW';
            }
          }

          callback(null, projection, unit);
        } else {
          if (err) {
            console.warn(err);
            callback(err);
          } else {
            console.warn('error getting variables from ' + dgm);
            callback('error getting variables from ' + dgm);
          }
        }
      });
    }
  }
};

var getRecent = function(dgm, elapsed, desired, processor, cb, res) {
  // Gets a recent set of data from the database
  
  if (dgm == null || dgm.length == 0) {
    cb('Invalid dgm: ' + dgm);
    return;
  }
  
  desired = (desired === undefined) ? [] : desired;
  
  /* Connect to the DB and auth */
  MongoClient.connect(mongourl, function(err, client) {
    if (err) { 
      cb(err);
      return;
    }
    
    const db = client.db(dbname);
    var collection = db.collection(cleanDGM(dgm));

    async.waterfall([ function(callback) {
      getProjectionAndUnits(db, dgm, desired, callback);
    }, function(projection, units, callback) {
      // get the time of the newest datapoint in the database
      collection.find().sort({time: -1}).limit(1).next(function(err, item) {
        if (!err && item) {
          callback(null, item.time, projection, units);
        } else {
          if (err) {
            console.warn(err);
            callback(err);
          } else {
            callback('error getting newest datapoint from ' + dgm);
          }
        }
      });
    }, function(latest, projection, units, callback) {
      // query for events newer than latest - elapsed
      var start = new Date(latest - elapsed);
      
      var cursor;
      
      if (projection) {
        if (processor == toRickshaw && elapsed > 1000*60*60*6) { // 6 hours

          var params = getAggregateParams(projection, elapsed);
        
          cursor = collection.aggregate(
            [
              {
                $match: {
                  time: {
                    $gt: start
                  }
                }
              },
              {
                $group: params.group
              },
              {
                $sort: params.sort
              }
            ],
            {
              cursor: {}
            }
            );
        } else {
          cursor = collection.find({ time: { $gt: start }}).project(projection);
          cursor.sort({time: 1});
        }
      } else {
        cursor = collection.find({ time: { $gt: new Date(latest - elapsed) }});
        cursor.sort({time: 1});
      }
      
      callback(null, client, cursor, elapsed, units, res);
    }, processor
    ], cb);
  });
};

var getAggregateParams = function(projection, elapsed) {
  // group by hour
  var group = {
    _id: {
      year : { $year : '$time' },
      month : { $month : '$time' },
      day : { $dayOfMonth : '$time' },
      hour : { $hour : '$time' },
    }
  };

  if (elapsed <= 1000*60*60*24*7) { // 1 week
    group._id.minute = { $minute : '$time' }; // group by minute
  }
  
  var sort = {};
  
  Object.keys(group._id).forEach(function(key) {
    sort['_id.' + key] = 1;
  });
  
  Object.keys(projection).forEach(function(field) {
    if (field != 'time') {
      group[field] = { $avg: '$' + field };
    }
  });
  
  return {
    sort: sort,
    group: group
  };
};

var getRange = function(dgm, start, end, desired, processor, cb, res) {
  // Gets data between two times from the database
  
  if (dgm == null || dgm.length == 0) {
    cb('Invalid dgm: ' + dgm);
    return;
  }
  
  desired = (desired === undefined) ? [] : desired;
  
  /* Connect to the DB and auth */
  MongoClient.connect(mongourl, function(err, client) {
    if (err) { 
      cb(err);
      return;
    }
    
    const db = client.db(dbname);
    var collection = db.collection(cleanDGM(dgm));

    async.waterfall([
      function(callback) {
        getProjectionAndUnits(db, dgm, desired, callback);
      },
      function(projection, units, callback) {
        // query for events between start and end
        var duration = end - start;

        var cursor;

        if (projection) {
          if (processor == toRickshaw && duration > 1000*60*60*6) { // 6 hours
  
            var params = getAggregateParams(projection, duration);
          
            cursor = collection.aggregate(
              [
                {
                  $match: {
                    time: {
                      $gt: start,
                      $lte: end
                    }
                  }
                },
                {
                  $group: params.group
                },
                {
                  $sort: params.sort
                }
              ],
              {
                cursor: {}
              }
              );
          } else {
            cursor = collection.find({ time: { $lte: end, $gt: start }}).project(projection);
            cursor.sort({time: 1});
          }
        } else {
          cursor = collection.find({ time: { $lte: end, $gt: start }});
          cursor.sort({time: 1});
        }
        
        callback(null, client, cursor, duration, units, res);
      }, processor
    ], cb);
  });
};

var generateCSV = function(dgms, variables, method, res, cb) {
  if (dgms.length > 1) {
    // handling multiple dgms is tricky
    var genArray = function(dgm, callback) {
      method(dgm, variables, toArray, callback);
    };

    async.map(dgms, genArray, function(err, results) {

      var header = [];
      var humanHeader = [];

      header.push('time');
      humanHeader.push('time');

      // headers
      var tracker = {};

      for (var r in results) {
        tracker[r] = 0;

        if (results[r]) {
          for (var col in results[r][0]) {
            if (col == 'time' || col == '_id')
              continue;

            header.push(col);

            if (col in humanize) {
              humanHeader.push(humanize[col]);
            } else {
              humanHeader.push(col);
            }
          }
        }
      }

      // error out if there are no columns
      if (header.length == 1) {
        cb('Could not retrieve data (no columns).');

        return;
      }

      if (variables != 'all') {
        res.write(humanHeader.toString());
      } else {
        res.write(header.toString());
      }

      do {
        var finished = true;

        // find the earliest time
        var minTime = undefined;

        for (var r in results) {
          if (results[r] && 
            tracker[r] < results[r].length && 
            results[r][tracker[r]].time) {

            if (minTime === undefined || results[r][tracker[r]].time < minTime) {
              minTime = results[r][tracker[r]].time;
            }
          }
        }

        var minTimeStr = moment(minTime).tz('America/New_York').format('DD-MMM-YY HH:mm:ss');

        // build the row for this time
        var row = {};

        for (var r in results) {
          if (results[r] && tracker[r] < results[r].length && 
            moment(results[r][tracker[r]].time).tz('America/New_York').format('DD-MMM-YY HH:mm:ss') == minTimeStr) {
            for (var h in header) {
              if (header[h] != 'time' && header[h] in results[r][tracker[r]]) {
                row[header[h]] = results[r][tracker[r]][header[h]];
              }
            }

            tracker[r]++;
            finished = false;
          }
        }

        // add blanks where appropriate
        var line = [];

        for (var h in header) {
          if (header[h] == 'time') {
            line.push(minTimeStr);
          } else if (header[h] in row) {
            line.push(row[header[h]]);
          } else {
            line.push('');
          }
        }

        if (!finished) {
          res.write('\n' + line.toString());
        }
      } while (!finished);

      cb(null);
    }); 
  } else {
    method(dgms[0], variables, toCSV, cb, res);
  }
};

var upload = function(dgm, file, callback) {
  /* Connect to the DB and auth */
  MongoClient.connect(mongourl, function(err, client) {

    if (err) {
      callback(err);
      return;
    }

    const db = client.db(dbname);
    client.collection(cleanDGM(dgm), function(err, collection) {

      if (err) {
        callback(err);
        return;
      }

      var validLineCount = 0;
      var lineCount = 0;

      // bulk operation
      var batch = collection.initializeUnorderedBulkOp();

      // list of parse errors
      var parseErrors = [];

      var rd = readline.createInterface({
        input: fs.createReadStream(file, {
          encoding: 'ascii'
        }),
        output: process.stdout,
        terminal: false
      });

      var header = [];

      rd.on('close', function() {
        batch.execute(function(err, result) {
          db.close();

          if (err) {
            callback(err);
          } else {
            if (parseErrors.length > 0) {
              callback(null, {
                lines: validLineCount,
                errors: parseErrors
              });
            } else {
              callback(null, {
                lines: validLineCount
              });
            }
          }
          
          fs.unlink(file, function(err) {
            if (err) {
              console.error('Could not delete file: ' + err.message);
            }
          });
        });
      });

      rd.on('line', function(line) {

        lineCount++;

        if (header.length == 0) {
          // assume first row is header
          header = line.split(',');
        } else {
          var row = line.split(',');

          if (row === undefined || row.length <= 0) {
            parseErrors.push('line ' + lineCount + ': No data on this line.');
            return;
          }

          if (row.length != header.length) {
            parseErrors.push('line ' + lineCount + ': Number of columns does not match number of columns in header.');
          }

          // assume first column is time
          var parsedMoment;

          if (row[0].indexOf('-') >= 0) {
            parsedMoment = moment.tz(row[0], 'DD-MMM-YY HH:mm:ss', 'America/New_York');
          } else {
            // try another format
            parsedMoment = moment.tz(row[0], 'MM/DD/YYYY HH:mm:ss', 'America/New_York');
          }


          if (!parsedMoment.isValid()) {
            parseErrors.push('line ' + lineCount + ': No time found on this line.');
            return;
          }

          var time = parsedMoment.toDate();

          var data = {};

          for (var i in header) {
            if (i > 0) {
              var val = parseInt(row[i], 10);

              if (!isNaN(val)) {
                data[header[i]] = val;
              } else if (dgm.indexOf('meta_') == 0) {
                // Only insert strings if meta collection
                data[header[i]] = row[i];
              }
            }
          }

          if (Object.keys(data).length == 0) {
            parseErrors.push('line ' + lineCount + ': No data found for this line.');
            return;
          }

          // keep track of how many lines we've gone through
          validLineCount++;

          data['time'] = time;

          batch.find({time: time}).upsert().updateOne({
            $set: data
          });
        }
      });
    });
  });
};

module.exports.getRange = getRange;
module.exports.getLatest = getLatest;
module.exports.getRecent = getRecent;
module.exports.toRickshaw = toRickshaw;
module.exports.toCSV = toCSV;
module.exports.toArray = toArray;
module.exports.diff = diff;
module.exports.generateCSV = generateCSV;
module.exports.upload = upload;
