powerdash
=========

Tracks energy usage at [41 Cooper Square](https://www.cooper.edu/about/history/41-cooper-square), the engineering building of [The Cooper Union](https://www.cooper.edu/).

Setup
-----

### Requirements

* [node.js](https://nodejs.org/) - 0.12.x
* [mongodb](https://www.mongodb.org/)

### Install

After you [clone this repository](https://help.github.com/articles/cloning-a-repository/), navigate to the root directory of this project in your terminal and run

```
$ npm install
```

### Configuration

#### socket.io

The server's domain is needed for `socket.io`. The default domain is `localhost:8080`. To change it, either:

* Set the environment variable `NODE_ENV` to `production` and create an environment variable named `DOMAIN` with the domain.
* Modify `app.js` and change the `host` variable to the domain.

#### Retreiving Data

To retrieve data, either:

* Set the environment variable `NODE_ENV` to `production` and create an environment variable named `AUTH` with a json string with the data below. Make sure the string does _not_ have newlines!
* Create a file named `auth.json` in the root of the repository with the data below.

The format of the file or string must be:

```JSON
{
  "modbus": {
    "name": "<modbus server name>",
    "ip": "<modbus ip address>"
  },
  "ntlm": {
    "auth": {
      "password": "<password>",
      "username": "<username>",
      "domain": "<domain>",
      "workstation": "<workstation>"
    },
    "type1_msg": "<ntlm type 1 message>",
    "request": {
      "hostname": "<server hostname>",
      "path": "<path to query>",
      "method": "<http method>",
      "port": <port>,
      "headers": {}
    }
  }
}
```

#### Storing Data

Retreived data is set up to be stored in a mongodb database. The database is accessed via a url which could either point to a local or remote database instance. By default, `mongo.js` loads from a locally hosted database. If you want to load from this database, make sure to run mongodb beforehand with

```
$ mongod
```

If you want to connect to a remote database, 

1. Set the `NODE_ENV` environment variable to `production`
2. Set the `MONGO_URL` environment variable to the url of the database server.

#### Optional Configuration

The http port can be set by changing the environment variable `PORT` to the desired port. It defaults to `8080` otherwise.

### Launching

To launch the server locally after following the previous steps, run
```
$ node ./app.js
```
then visit `localhost:8080` (or the domain you set) in your browser.

API
---

The application program interface (API) is how external software can communicate with this program. The frontend code running inside the brower also uses this interface to query for data.

## `/recent` - query for recent datapoints

This method returns a set of recent datapoints. For example, it can be used to query for data recorded during the previous hour.

### Method

| URI       | HTTP Method |
| --------- | ----------- |
| `/recent` | `GET`       |

### Request Parameters

| Parameter     | Type   | Description                                   | Default                           | Required |
| ------------- | ------ | --------------------------------------------- | --------------------------------- | -------- |
| **elapsed**   | Number | Number of millseconds before the latest entry | `60 * 60 * 1000` (one hour)       | No       |
| **dgm**       | String | Collection to query                           | `x-pml:/diagrams/ud/41cooper.dgm` | No       |
| **variables** | String | Comma-separated list of fields, or `all`      | `kW`-only fields                  | No       |
| **format**    | String | Response format, either `csv` or `rickshaw`   | `rickshaw`                        | No       |

### Notes

`rickshaw` is intended to be used by the Rickshaw charting library. The `csv` format also supports a comma-separated list of collections.

## `/recent/diff` - change in value

This method returns the difference between the current and a past set of datapoints. For example, it can be used to query for the amount of water collected over the previous day.

### Method

| URI            | HTTP Method |
| -------------- | ----------- |
| `/recent/diff` | `GET`       |

### Request Parameters

| Parameter     | Type   | Description                                   | Default                                     | Required |
| ------------- | ------ | --------------------------------------------- | ------------------------------------------- | -------- |
| **elapsed**   | Number | Number of millseconds before the latest entry | `24 * 60 * 60 * 1000` (one day)             | No           |
| **dgm**       | String | Collection to query                           | `x-pml:/diagrams/ud/41cooper/greywater.dgm` | No           |
| **variables** | String | Comma-separated list of fields, or `all`      | `all`                                       | No           |

### Example Output

```JSON
{
  "time": 86400000,
  "ART9 Result 1": 280,
  "ART8 Result 1": 0,
  "ART8 Result 2": 280
}
```

Note that the time is not the current time, but the time elapsed between the data points used for the calculation (in case the time difference is not exactly 24 hours).

## `/range` - query for a range of datapoints

This method returns datapoints recorded during a time interval. For example, it can be used to query for data recorded on a certain date.

### Method

| URI       | HTTP Method |
| --------- | ----------- |
| `/range`  | `GET`       |

### Request Parameters

| Parameter     | Type   | Description                                 | Default                           | Required |
| ------------- | ------ | ------------------------------------------- | --------------------------------- | -------- |
| **start**     | Number | Start of desired range as a unix timestamp  | None                              | _Yes_    |
| **end**       | Number | End of desired range as a unix timestamp    | the current time                  | No       |
| **dgm**       | String | Collection to query                         | `x-pml:/diagrams/ud/41cooper.dgm` | No       |
| **variables** | String | Comma-separated list of fields, or `all`    | `kW`-only fields                  | No       |
| **format**    | String | Response format, either `csv` or `rickshaw` | `rickshaw`                        | No       |

### Notes

**start** must be earlier than **end**. `rickshaw` is intended to be used by the Rickshaw charting library. The `csv` format also supports a comma-separated list of collections.

## `/upload` - upload new datapoints from a file

This method allows new datapoints to be uploaded to the server. 

### Method

| URI       | HTTP Method |
| --------- | ----------- |
| `/upload` | `POST`      |

### Request Parameters

| Parameter      | Type   | Description                                                                | Default | Required |
| -------------- | ------ | -------------------------------------------------------------------------- | ------- | -------- |
| **collection** | String | Name of the collection the data belongs to                                 | None    | _Yes_    |
| **data**       | Binary | [CSV](//en.wikipedia.org/wiki/Comma-separated_values) file with header row | None    | _Yes_    |

### Response

A webpage with the upload form, number of lines correctly parsed, and any parsing errors.

### Notes

This cannot be used to update the `meta` collections because it is assumed that the first column represents `time`. Time should follow the CSV format created by this application. This route is intended to be used by the form obtained by doing a `GET` request on `/upload`.

Realtime Updates
----------------

Clients can receive realtime updates using **socket.io**, a library for real-time communication. Upon the first connection, clients should emit `load` with an object that contains `dgm`, `variables`, and `elapsed` (the same parameters as the `/recent` api). The server will then emit a `dataset` event with the corresponding recent data. This is similar to directly calling the `/recent` route, but perhaps works better with a realtime workflow. Here is an example object:

```JSON
{
  "dgm": "x-pml:/diagrams/ud/41cooper.dgm",
  "variables": "all",
  "elapsed": 3600000
}
```

Note that `variables` should be an array instead of a comma-separated string of desired fields. The output is in `rickshaw` format.

To subscribe to realtime updates, emit `update` with the desired `dgm`. If no `dgm` is specified, `x-pml:/diagrams/ud/41cooper.dgm` is the default.

To unsubscribe from realtime updates, emit `pause` with the desired `dgm` to unsubscribe from. If no `dgm` is specified, `x-pml:/diagrams/ud/41cooper.dgm` is the default.

Data is emitted via the `update` event. Here is an example update:

```JSON
[
  {
    "name": "SRV1KW",
    "data": [
      {
        "x": 1427942712,
        "y": 252
      }
    ]
  },
  {
    "name": "SV2KW",
    "data": [
      {
        "x": 1427942712,
        "y": 62
      }
    ]
  }
]
```

Note that `name` corresponds to the `raw` field in the `rickshaw` response.

How it Works
------------

### Retreiving Data

The configuration information specified in `auth.json` (or the `AUTH` environment variable) dictates the source of the data. `modbus` and `ntlm` are the two types of protocols supported. The data itself is retrieved by `scrape.js`. The frequency and parameters for retrieval are specified in `scrape.json`.

#### Modbus

Modbus is a communications protocol commonly found in industrial environments. It features a variety of "function codes" used to specify the type of action to be performed. In this particular application, only "Read Holding Registers" which has a function code of "3" is used to query data from a Modbus _server_, with this application serving as a Modbus _client_.

##### Configuration

Modbus itself has no authentication scheme, but there are a couple bits of information that are still needed:

| name   | example         | use                                      |
| ------ | --------------- | ---------------------------------------- |
| `name` | `cogen`         | an alias for this server in the database |
| `ip`   | `22.231.113.64` | the ip address of the server             |

The specified IP address is then queried at the default Modbus port (`502`) and 41 registers are read.

##### Processing

The data retrieved by Modbus needs to be massaged into a more useful format. `modbus.json` specifies how to interpret the data retrieved. It has three fields:

| field   | value                                           |
| ------- | ----------------------------------------------- |
| `name`  | name of the register                            |
| `unit`  | the units of the value                          |
| `scale` | the retrieved value is multipled by this number |

Once the data is retrieved, it is stored in the database with the time the data was retrieved.

#### NTLM

NTLM is an authentication protocol created by Microsoft. In this application, it is presumed that the server that is being queried for data requires NTLM authentication.

##### Configuration

This application logs onto the server with the credentials provided in `auth`. `type1_msg` is the initial authentication message sent to the server, and can usually be sniffed (though the credentials must match the credentials provided in `auth`, including the `domain` and `workstation`). It can also be generated by [python-ntlm](https://code.google.com/p/python-ntlm/) and other software. It is specified here for reproducibility reasons. 

The `request` field specifies how to contact the server, and is directly passed as [the "options" argument](https://nodejs.org/api/http.html#http_http_request_options_callback) of the corresponding `https.request()` call.

`scrape.json` also specifies a couple other parameters that are passed as the body of the request. These specify the data to be retrieved. Here is a sample request body:

```JSON
{
  "dgm": "x-pml:/diagrams/ud/41cooper.dgm",
  "id": "",
  "node": "COOPER.41COOPERSQ"
}
```

##### Processing

Here is an example of a response from the server (given the sample request body above):

```JSON
{
  "d": "<DiagramInput savedAt=\"2015-04-01 22:45:12\" xmlns=\"http://rddl.xmlinside.net/PowerMeasurement/data/webreach/realtime/1/\">\r\n  <Items nodeName=\"COOPER.41COOPERSQ\" status=\"succeeded\">\r\n    <Item h=\"18573\" dt=\"0\" un=\"CCF\" l=\"SRV1GS_CCF\" r=\"0\" v=\"676,701\" rv=\"676701\" />\r\n    <Item h=\"18577\" dt=\"0\" un=\"CCF\" l=\"SRV2GS_CCF\" r=\"0\" v=\"630,386\" rv=\"630386\" />\r\n    <Item h=\"22656\" dt=\"0\" un=\"kW\" l=\"SRV1KW\" r=\"0\" v=\"252\" rv=\"252\" />\r\n    <Item h=\"22657\" dt=\"0\" un=\"kW\" l=\"SV2KW\" r=\"0\" v=\"62\" rv=\"62\" />\r\n    <Item h=\"22672\" dt=\"0\" un=\"kW\" l=\"SRV1PKW\" r=\"0\" v=\"248\" rv=\"248\" />\r\n    <Item h=\"22673\" dt=\"0\" un=\"kW\" l=\"SV2PKW\" r=\"0\" v=\"62\" rv=\"62\" />\r\n    <Item h=\"22674\" dt=\"0\" un=\"CCF/HR\" l=\"SRV1PGS\" r=\"0\" v=\"0\" rv=\"0\" />\r\n    <Item h=\"22675\" dt=\"0\" un=\"CCF/HR\" l=\"SV2PGS\" r=\"0\" v=\"0\" rv=\"0\" />\r\n    <Item h=\"23362\" dt=\"0\" un=\"kW\" l=\"Total KW\" r=\"0\" v=\"311\" rv=\"311\" />\r\n    <Item h=\"24286\" dt=\"0\" un=\"sec\" l=\"SD1 Time Left\" r=\"0\" v=\"593\" rv=\"593\" />\r\n  </Items>\r\n</DiagramInput>"
}
```

Inside the `d` field is just XML. Reformatted:

```xml
<DiagramInput savedAt="2015-04-01 22:45:12" xmlns="http://rddl.xmlinside.net/PowerMeasurement/data/webreach/realtime/1/">
  <Items nodeName="COOPER.41COOPERSQ" status="succeeded">
    <Item h="18573" dt="0" un="CCF" l="SRV1GS_CCF" r="0" v="676,701" rv="676701" />
    <Item h="18577" dt="0" un="CCF" l="SRV2GS_CCF" r="0" v="630,386" rv="630386" />
    <Item h="22656" dt="0" un="kW" l="SRV1KW" r="0" v="252" rv="252" />
    <Item h="22657" dt="0" un="kW" l="SV2KW" r="0" v="62" rv="62" />
    <Item h="22672" dt="0" un="kW" l="SRV1PKW" r="0" v="248" rv="248" />
    <Item h="22673" dt="0" un="kW" l="SV2PKW" r="0" v="62" rv="62" />
    <Item h="22674" dt="0" un="CCF/HR" l="SRV1PGS" r="0" v="0" rv="0" />
    <Item h="22675" dt="0" un="CCF/HR" l="SV2PGS" r="0" v="0" rv="0" />
    <Item h="23362" dt="0" un="kW" l="Total KW" r="0" v="311" rv="311" />
    <Item h="24286" dt="0" un="sec" l="SD1 Time Left" r="0" v="593" rv="593" />
  </Items>
</DiagramInput>
```

The data is then parsed with _xml2js_. The `savedAt` attribute is parsed using _moment_ to a timestamp. For each `Item`, only some of the attributes are used:

| attribute | usage             |
| --------- | ----------------- |
| `l`       | name of the item  |
| `un`      | unit of the value |
| `rv`      | the actual value  |

### Storing Data

Data is stored in mongodb, a NoSQL document database. Data is stored in the `energydata` database inside the connected mongodb instance. The database consists of a set of "collections", each of which contains a series of "documents". 

For Modbus queries, the `name` specified in `auth.json` is used as the name of the collection.

For NTLM queries, each `dgm` specified in `scrape.json` corresponds to another collection in the database. Note that the names are "cleaned" by replacing forward slashes (`/`) with dashes (`-`). This facilitates saving the database to a file using `mongoexport`.

Additional metadata for each collection is specified in another collection, named by prepending `meta_` to the name of the collection it corresponds to. Therefore the list of collections for the above NTLM query (where `dgm` is `x-pml:/diagrams/ud/41cooper.dgm`) would be

| collection | name                                   |
| ---------- | -------------------------------------- |
| data       | `x-pml:-diagrams-ud-41cooper.dgm`      |
| meta       | `meta_x-pml:-diagrams-ud-41cooper.dgm` |

#### Data Collection

Each document in a data collection corresponds to a successful data retrevial. For the example data retrieved above, the resulting document would be similar to this:

```JSON
{
  "_id": {
    "$oid": "551c9f1c9d368103000a918b"
  },
  "time": {
    "$date": "2015-04-02T02:45:12.000Z"
  },
  "SRV1GS_CCF": 676701,
  "SRV2GS_CCF": 630386,
  "SRV1KW": 252,
  "SV2KW": 62,
  "SRV1PKW": 248,
  "SV2PKW": 62,
  "SRV1PGS": 0,
  "SV2PGS": 41,
  "Total KW": 311,
  "SD1 Time Left": 593
}
```

`_id` is a field generated by mongodb that can be used to uniquely identify a set of data. `time` is UTC equivalent of the current time for Modbus queries or the `savedAt` attribute for NTLM queries.

#### Meta Collection

The _meta_ collection contains information about each of the fields in a data document. Each document corresponds to a field in the corresponding data collection

For example, this is a sample document that corresponds to the `SV2KW` field in the `x-pml:/diagrams/ud/41cooper.dgm` collection (so this document would be found in the `meta_x-pml:-diagrams-ud-41cooper.dgm` collection).

```JSON
{
  "_id": {
    "$oid": "53dd9abd1b1079fbb32b0eaa"
  },
  "h": "22657",
  "name": "SV2KW",
  "unit": "kW"
}
```

This additional information is extracted from the data retrieved above.

### Displaying Data

#### Querying for Data

The data displayed by this application is often a subset of the data stored in the database. This is achieved by adding constraints to our database queries. For example, if we want to query the past two hours of data, we start with the current time:

```JavaScript
var currentTime = new Date();
```

then subtract "two hours" in milliseconds, or `2` × `60 minutes/hour` × `60 seconds/hour` × `1000 milliseconds/second` and create a new `Date` object:

```JavaScript
var twoHours = 2 * 60 * 60 * 1000; // in milliseconds
var twoHoursAgo = new Date(currentTime - twoHours);
```

Then query for documents with `time > twoHoursAgo`

```JavaScript
var cursor = collection.find({ time: { $gt: twoHoursAgo }})
```

where `$gt` represents the "greater than" operator. The retrieved documents are then massaged to meet the requirements of the desired output format.

##### Data Aggregation

When using the `rickshaw` output format, the data is aggregated to reduce the number of points.

| Duration      | Aggregate |
| ------------- | --------- |
| &le; 6 hours  | None      |
| &le; 1 week   | Minute    |
| &le; 1 month  | Hourly    |
| &le; 6 months | Daily     |
| &gt; 6 months | Weekly    |

The aggregation performed is a simple average of the available data points. Note that "daily" aggregation is performed in the [Eastern Time Zone](http://en.wikipedia.org/wiki/Eastern_Time_Zone), which is either EST or EDT depending on whether or not daylight savings time is being observed.

#### Data Formats

##### Comma-Separated Values (CSV)

The CSV format is a simple file format used for storing tabular data. It consists of a header, with each column separated by a comma, and the data, with each row separated by a newline character. For example the NTLM data above can be represented as

```
time,SRV1GS_CCF,SRV2GS_CCF,SRV1KW,SV2KW,SRV1PKW,SV2PKW,SRV1PGS,SV2PGS,Total KW,SD1 Time Left
02-Apr-15 02:45:12,676701,630386,252,62,248,62,0,41,311,593
```
The time is formatted to suit [Excel](https://products.office.com/en-us/excel), but any program should be able to parse it.

##### Rickshaw

Rickshaw is the library used to graph the data. It expects each series as a separate item, so it is necessary to break up each field into separate series. Here is an example of one series:

```JSON
{
  "name": "Utility Service 1",
  "raw": "SRV1KW",
  "id": "SRV1KW",
  "unit": "kW",
  "data": [
    {
      "x": 1427942712,
      "y": 252
    }
  ]
}
```

`name` is converted from `raw` using the mapping specified in `humanize.json`. This is the human-readable name. Inside `data`, `x` is the [unix timestamp](http://en.wikipedia.org/wiki/Unix_time), and `y` is the value at that time.

Libraries
---------

### Backend

* [express](http://expressjs.com/) as a server-side framework and template rendering via [jade](http://jade-lang.com/)
* [moment](http://momentjs.com/) to parse and render time information
* [socket.io](http://socket.io/) to stream updates to the browser
* [node-ntlm-auth](https://github.com/ericleong/node-ntlm-auth) for NTLM authentication
* [modbus-stack](https://github.com/TooTallNate/node-modbus-stack) for modbus communication (modified to add ["read holding registers"](https://github.com/TooTallNate/node-modbus-stack/pull/3))
* [xml2js](https://github.com/Leonidas-from-XIV/node-xml2js)

### Frontend

* [jQuery](https://jquery.com/) to manipulate the DOM
* [rickshaw](http://code.shutterstock.com/rickshaw/) with [d3](http://d3js.org/) to graph the data
