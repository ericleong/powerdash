energydash
==========

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

To retrieve data, create a file named `auth.json` in the root of the repository in this format:
```
{
  "modbus": {
    "name": "<modbus server name>",
    "ip": "<modbus ip address>",
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