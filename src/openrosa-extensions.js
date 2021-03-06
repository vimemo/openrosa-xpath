var EARTH_EQUATORIAL_RADIUS_METERS = 6378100;
var PRECISION = 100;

function _toLatLngs(geopoints) {
  return geopoints.map(function (geopoint) {
    return geopoint.trim().split(' ');
  });
}

// converts degrees to radians
function _toRadians(angle) {
  return angle * Math.PI / 180;
}

// check if all geopoints are valid (copied from Enketo FormModel)
function _latLngsValid(latLngs) {
  return latLngs.every(function (coords) {
    return (
      (coords[0] !== '' && coords[0] >= -90 && coords[0] <= 90) &&
      (coords[1] !== '' && coords[1] >= -180 && coords[1] <= 180) &&
      (typeof coords[2] == 'undefined' || !isNaN(coords[2])) &&
      (typeof coords[3] == 'undefined' || (!isNaN(coords[3]) && coords[3] >= 0))
    );
  });
}

/**
 * Adapted from https://www.movable-type.co.uk/scripts/latlong.html
 *
 * @param {{lat:number, lng: number}} p1
 * @param {{lat:number, lng: number}} p2
 * @returns {number}
 */
function _distanceBetween(p1,p2) {
  var Δλ = _toRadians(p1.lng - p2.lng);
  var φ1 = _toRadians(p1.lat);
  var φ2 = _toRadians(p2.lat);
  return Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * EARTH_EQUATORIAL_RADIUS_METERS;
}

function areaOrDistance(xpr, fn, r) {
  var geopoints = [];
  if(r.t === 'str') geopoints = r.v.split(';');
  if(r.t === 'arr') {
    if(r.v.length === 1) geopoints = r.v[0].split(';');
    else geopoints = r.v;
  }
  return xpr(fn(geopoints));
}

/**
 * Adapted from https://github.com/Leaflet/Leaflet.draw/blob/3cba37065ea5be28f42efe9cc47836c9e3f5db8c/src/ext/GeometryUtil.js#L3-L20
 */
function area(geopoints) {
  var latLngs = _toLatLngs(geopoints);

  if (!_latLngsValid(latLngs)) {
    return Number.NaN;
  }

  var pointsCount = latLngs.length;
  var area = 0.0;

  if (pointsCount > 2) {
    for (var i = 0; i < pointsCount; i++) {
      var p1 = {
        lat: latLngs[i][0],
        lng: latLngs[i][1]
      };
      var p2 = {
        lat: latLngs[(i + 1) % pointsCount][0],
        lng: latLngs[(i + 1) % pointsCount][1]
      };
      area += _toRadians(p2.lng - p1.lng) *
          (2 + Math.sin(_toRadians(p1.lat)) + Math.sin(_toRadians(p2.lat)));
    }
    area = area * EARTH_EQUATORIAL_RADIUS_METERS * EARTH_EQUATORIAL_RADIUS_METERS / 2.0;
  }
  return Math.abs(Math.round(area * PRECISION)) / PRECISION;
}

/**
 * @param {any} geopoints
 * @returns
 */
function distance(geopoints) {
  var latLngs = _toLatLngs(geopoints);

  if (!_latLngsValid(latLngs)) {
    return Number.NaN;
  }

  var pointsCount = latLngs.length;
  var distance = 0.0;

  if (pointsCount > 1) {
    for (var i = 1; i < pointsCount; i++) {
      var p1 = {
        lat: latLngs[i - 1][0],
        lng: latLngs[i - 1][1]
      };
      var p2 = {
        lat: latLngs[i][0],
        lng: latLngs[i][1]
      };

      distance += _distanceBetween(p1, p2);
    }
  }

  return Math.abs(Math.round(distance * PRECISION)) / PRECISION;
}


var ALGOS = {
  'md5': 'md5',
  'sha-1': 'sha1',
  'sha-256': 'sha256',
  'sha-384': 'sha384',
  'sha-512': 'sha512',
}

function _digest(message, algo, encoding) {
  message = message.v;
  algo = algo && algo.v && algo.v.toLowerCase();
  encoding = (encoding && encoding.v && encoding.v.toLowerCase()) || 'base64';

  if(!algo || !/^(sha-1|sha-256|sha-384|sha-512)$/.test(algo)) {
    throw new Error('Invalid algo.');
  }

  if(!/^(base64|hex)$/.test(encoding)) {
    throw new Error('Invalid encoding.');
  }

  var msgUint8 = new TextEncoder().encode(message);
  return crypto.subtle.digest(algo, msgUint8).then(function(hashBuffer) {
    if(!encoding || encoding === 'base64') {
      var binary = '';
      var bytes = new Uint8Array(hashBuffer);
      var len = bytes.byteLength;
      for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
      }
      return Promise.resolve(window.btoa(binary));
    } else if(encoding === 'hex') {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return Promise.resolve(hashArray.map(function(b) {
        return b.toString(16).padStart(2, '0');
      }).join(''));
    }
  });
}

function _random13chars() {
  return Math.random().toString(16).substring(2)
}

function _randomToken(length) {
	var loops = Math.ceil(length / 13)
	return new Array(loops)
    .fill(_random13chars)
    .reduce(function(string, func) {
		    return string + func()
	   }, '').substring(0, length);
}


var openrosa_xpath_extensions = function(settings) {
  var
      TOO_MANY_ARGS = new Error('too many args'),
      TOO_FEW_ARGS = new Error('too few args'),
      MILLIS_PER_DAY = 1000 * 60 * 60 * 24,
      RAW_NUMBER = /^(-?[0-9]+)(\.[0-9]+)?$/,
      DATE_STRING = /^\d\d\d\d-\d{1,2}-\d{1,2}(?:T\d\d:\d\d:\d\d\.?\d?\d?(?:Z|[+-]\d\d:\d\d)|.*)?$/,
      XPR = {
        nodes: function(val) { return { t:'nodes', v:val }; },
        boolean: function(val) { return { t:'bool', v:val }; },
        number: function(val) { return { t:'num', v:val }; },
        string: function(val) { return { t:'str', v:val }; },
        date: function(val) {
          if(!(val instanceof Date)) throw new Error('Cannot create date from ' + val + ' (' + (typeof val) + ')');
          return { t:'date', v:val };
        }
      },
      _zeroPad = function(n, len) {
        len = len || 2;
        n = n.toString();
        while(n.length < len) n = '0' + n;
        return n;
      },
      _int = function(r) { return Math.round(_float(r)); },
      _float = function(r) { return r.t === 'num'? r.v: parseFloat(_str(r)); },
      _str = function(r) {
        return r.t === 'arr' ?
               r.v.length ? r.v[0].toString() : '' :
            r.v.toString();
      },
      _dateToString = function(d) {
            return d.getFullYear() + '-' + _zeroPad(d.getMonth()+1) + '-' +
                _zeroPad(d.getDate());
      },
      _round = function(num) {
        if(num < 0) {
          return -Math.round(-num);
        }
        return Math.round(num);
      },
      _uuid_part = function(c) {
        // TODO understand what these are used for - they're probably not very unique
        var r = Math.random()*16|0,
            v = c == 'x' ? r : r&0x3|0x8;
        return v.toString(16);
      },
      _date = function(it, keepTime) {
        var temp, t;
        if(it.v instanceof Date) {
          return new Date(it.v);
        }
        it = _str(it);
        if(RAW_NUMBER.test(it)) {
          // Create a date at 00:00:00 1st Jan 1970 _in the current timezone_
          temp = new Date(1970, 0, 1);
          temp.setDate(1 + parseInt(it, 10));
          return temp;
        } else if(DATE_STRING.test(it)) {
          if(keepTime) return new Date(it);
          t = it.indexOf('T');
          if(t !== -1) it = it.substring(0, t);
          temp = it.split('-');
          temp = new Date(temp[0], temp[1]-1, temp[2]);
          return temp;
        }
        var d = new Date(it);
        return d == 'Invalid Date' ? null : d;
      },
      _dateForReturnType = function(it, rt) {
        if(rt === XPathResult.BOOLEAN_TYPE) {
          if(!it) return XPR.boolean(false);
          return XPR.boolean(!isNaN(new Date(it).getTime()));
        }
        if(rt === XPathResult.NUMBER_TYPE) {
          if(!it) return XPR.number(0);
          return XPR.number((new Date(it).getTime()) / (1000 * 60 * 60 * 24));
        }
        if(rt === XPathResult.STRING_TYPE) {
          if(!it) return XPR.string('Invalid Date');
          return XPR.string(new Date(it).toISOLocalString());
        }
        if(!it) return XPR.string('Invalid Date');
        return XPR.date(it);
      },
      uuid = function() {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
                  .replace(/[xy]/g, _uuid_part);
      },
      date = function(it, rt) {
        it = _date(it);
        return _dateForReturnType(it, rt);
      },
      format_date = function(date, format) {
        date = _date(date, true);
        if(!format) return '';
        format = _str(format);
        if(!date) return 'Invalid Date';
        var c, i, sb = '', f = {
          year: 1900 + date.getYear(),
          month: 1 + date.getMonth(),
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          second: date.getSeconds(),
          millis: date.getMilliseconds(),
          secTicks: date.getTime(),
          dow: 1 + date.getDay(),
        };
        var locale = window ? window.enketoFormLocale : undefined;
        for(i=0; i<format.length; ++i) {
          c = format.charAt(i);

          if (c === '%') {
            if(++i >= format.length) {
              throw new Error("date format string ends with %");
            }
            c = format.charAt(i);

            if (c === '%') { // literal '%'
              sb += '%';
            } else if (c === 'Y') {  //4-digit year
              sb += _zeroPad(f.year, 4);
            } else if (c === 'y') {  //2-digit year
              sb += _zeroPad(f.year, 4).substring(2);
            } else if (c === 'm') {  //0-padded month
              sb += _zeroPad(f.month, 2);
            } else if (c === 'n') {  //numeric month
              sb += f.month;
            } else if (c === 'b') {  //short text month
              sb += date.toLocaleDateString( locale, { month: 'short' } );
            } else if (c === 'd') {  //0-padded day of month
              sb += _zeroPad(f.day, 2);
            } else if (c === 'e') {  //day of month
              sb += f.day;
            } else if (c === 'H') {  //0-padded hour (24-hr time)
              sb += _zeroPad(f.hour, 2);
            } else if (c === 'h') {  //hour (24-hr time)
              sb += f.hour;
            } else if (c === 'M') {  //0-padded minute
              sb += _zeroPad(f.minute, 2);
            } else if (c === 'S') {  //0-padded second
              sb += _zeroPad(f.second, 2);
            } else if (c === '3') {  //0-padded millisecond ticks (000-999)
              // sb += _zeroPad(f.secTicks, 3);
              sb += _zeroPad(f.millis, 3);
            } else if (c === 'a') {  //Three letter short text day
              sb += date.toLocaleDateString( locale, { weekday: 'short' } );
            } else if (c === 'Z' || c === 'A' || c === 'B') {
              throw new Error('unsupported escape in date format string [%' + c + ']');
            } else {
              throw new Error('unrecognized escape in date format string [%' + c + ']');
            }
          } else {
            sb += c;
          }
        }

        return sb;
      },
      func, process, ret = {},
      now_and_today = function(rt, resetTime) {
        return _dateForReturnType(ret._now(resetTime), rt);
      };

  func = {
    abs: function(r) { return XPR.number(Math.abs(r.v)); },
    acos: function(r) { return XPR.number(Math.acos(r.v)); },
    asin: function(r) { return XPR.number(Math.asin(r.v)); },
    atan: function(r) { return XPR.number(Math.atan(r.v)); },
    atan2: function(r) {
      if(arguments.length>1) {
        var y = arguments[0].v;
        var x = arguments[1].v;
        return XPR.number(Math.atan2(y, x));
      }
      return XPR.number(Math.atan2(r.v));
    },
    'boolean-from-string': function(string) {
      string = _str(string);
      return XPR.boolean(string === '1' || string === 'true');
    },
    area: function(r) {
      if(arguments.length === 0) throw TOO_FEW_ARGS;
      return areaOrDistance(XPR.number, area, r);
		},
    checklist: function(min, max) {
      var i, j, trues = 0;
      min = min.v;
      max = max.v;
      for (i=2;i < arguments.length;i++) {
        var arg = arguments[i];
        if (arg.t === 'bool' && Boolean(arg.v)) {
          trues++;
        } else if (arg.t === 'arr') {
          for(j=0;j<arg.v.length;j++) {
            if(Boolean(arg.v[j])) trues++;
          }
        }
      }
      return XPR.boolean((min < 0 || trues >= min) && (max < 0 || trues <= max));
    },
    coalesce: function(a, b) { return XPR.string(_str(a) || _str(b)); },
    concat: function() {
      var out = [];
      for (var j = 0; j < arguments.length; j++){
        if(arguments[j].t === 'arr') {
          out.push(arguments[j].v.join(''));
        } else {
          out.push(arguments[j].v);
        }
      }
      return XPR.string(out.join(''));
    },
    cos: function(r) { return XPR.number(Math.cos(r.v)); },
    'count-non-empty': function(r) {
      if(arguments.length === 0 || r.t !== 'arr') throw TOO_FEW_ARGS;
      var counter = 0;
      for (var j = 0; j < r.v.length; j++){
        counter += r.v[j] === '' ? 0 : 1;
      }
      return XPR.number(counter);
    },
    'count-selected': function(s) {
      var parts = _str(s).split(' '),
          i = parts.length,
          count = 0;
      while(--i >= 0) if(parts[i].length) ++count;
      return XPR.number(count);
    },
    date: function(it, rt) {
      it = _date(it);
      return _dateForReturnType(it, rt);
    },
    'decimal-date': function(date) {
      if(arguments.length > 1) throw TOO_MANY_ARGS;
      var res = Date.parse(_str(date)) / MILLIS_PER_DAY;
      return XPR.number(Math.round(res * 1000)/1000);
    },
    'decimal-time': function(r) {
      if(arguments.length > 1) throw TOO_MANY_ARGS;
      if(r.t === 'num') return XPR.number(NaN);
      var time = r.v;
      // There is no Time type, and so far we don't need it so we do all validation
      // and conversion here, manually.
      var	m = time.match(/^(\d\d):(\d\d):(\d\d)(\.\d\d?\d?)?(\+|-)(\d\d):(\d\d)$/);
      var PRECISION = 1000;
      var dec;
      if (m &&
        m[1] < 24 && m[1] >= 0 &&
        m[2] < 60 && m[2] >= 0 &&
        m[3] < 60 && m[3] >= 0 &&
        m[6] < 24 && m[6] >= 0 && // this could be tighter
        m[7] < 60 && m[7] >= 0 // this is probably either 0 or 30
      ) {
        var pad2 = function(x) { return (x < 10) ? '0' + x : x; };
        var today = new Date(); // use today to cater to daylight savings time.
        var d = new Date(today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate()) + 'T' + time);
        if(d.toString() === 'Invalid Date'){
          dec = NaN;
        } else {
          dec = Math.round((d.getSeconds()/3600 + d.getMinutes()/60 + d.getHours()) * PRECISION/24) / PRECISION;
        }
      } else {
        dec = NaN;
      }
      return XPR.number(dec);
    },
    digest: function(msg, algo, encoding) {
      return XPR.string(_digest(msg, algo, encoding));
    },
    distance: function(r) {
      if(arguments.length === 0) throw TOO_FEW_ARGS;
      return areaOrDistance(XPR.number, distance, r);
    },
    exp: function(r) { return XPR.number(Math.exp(r.v)); },
    exp10: function(r) { return XPR.number(Math.pow(10, r.v)); },
    'false': function(rt) {
      if(rt === XPathResult.NUMBER_TYPE) return XPR.number(0);
      if(arguments.length>1) throw TOO_MANY_ARGS;
      return XPR.boolean(false);
    },
    'format-date': function(date, format) {
      return XPR.string(format_date(date, format)); },
    'if': function(con, a, b) {
      if(con.t === 'bool') return XPR.string(Boolean(con.v) ? a.v : b.v);
      if(con.t === 'arr') {
        var exists = con.v.length && con.v[0] !== null;
        return XPR.string(exists ? a.v : b.v);
      }
      return XPR.string(b.v);
    },
    'ends-with': function(a, b) {
      if(arguments.length > 2) throw TOO_MANY_ARGS;
      if(arguments.length < 2) throw TOO_FEW_ARGS;
      return XPR.boolean(a.v.endsWith(b.v));
    },
    int: function(v) {
      if(v.t === 'str' && v.v.indexOf('e-')>0) return XPR.number(NaN);
      v = _str(v);
      if(v.indexOf('e-')>0) return XPR.number(0);
      return XPR.number(parseInt(v, 10));
    },
    join: function() {
      var delim = arguments[0];
      if(arguments.length<2) return XPR.string('');
      if(arguments.length>2) {
        var out = [];
        for (var i = 1; i < arguments.length; i++){
          out.push(arguments[i].v);
        }
        return XPR.string(out.join(_str(delim)));
      }
      return XPR.string(arguments[1].v.join(_str(delim)));
    },
    log: function(r) { return XPR.number(Math.log(r.v)); },
    log10: function(r) { return XPR.number(Math.log10(r.v)); },
    max: function() {
      if(arguments.length > 1) {
        var out = [];
        for (var j = 0; j < arguments.length; j++){
          out.push(arguments[j].v);
        }
        return XPR.number(Math.max.apply(null, out));
      }
      var max, i;
      var r = arguments[0].v;
      if(!(i=r.length)) return XPR.number(NaN);
      max = parseFloat(r[0]);
      while(--i) max = Math.max(max, parseFloat(r[i]));
      return XPR.number(max);
    },
    min: function() {
      if(arguments.length > 1) {
        var out = [];
        for (var j = 0; j < arguments.length; j++){
          out.push(arguments[j].v);
        }
        return XPR.number(Math.min.apply(null, out));
      }
      var min, i;
      var r = arguments[0].v;
      if(!(i=r.length)) return XPR.number(NaN);
      min = parseFloat(r[0]);
      while(--i) min = Math.min(min, parseFloat(r[i]));
      return XPR.number(min);
    },
    /*
     * As per https://github.com/alxndrsn/openrosa-xpath-evaluator/issues/15,
     * the pass-through to the wrapped implementation always requests
     * XPathResult.STRING_TYPE.  This seems to cause an issue with the response
     * from `not()` calls, which should ideally be handled by the built-in
     * XPath implementation.  The following method is supplied as a workaround,
     * and ideally would be unnecessary.
     */
    not: function(r) {
      if(arguments.length === 0) throw TOO_FEW_ARGS;
      if(arguments.length > 1) throw TOO_MANY_ARGS;
      return XPR.boolean(!r.v);
    },
    now: function(rt) {
      return now_and_today(rt);
    },
    today: function(rt) {
      var r = now_and_today(rt, !settings.returnCurrentTimeForToday);
      if(rt === XPathResult.STRING_TYPE && !settings.includeTimeForTodayString) {
        r.v = r.v.split('T')[0];
      }
      return r;
    },
    /**
     * The once function returns the value of the parameter if its own value
     * is not empty, NaN, [Infinity or -Infinity]. The naming is therefore misleading!
     * Also note that the parameter expr is always evaluated.
     * This function simply decides whether to return the new result or the old value.
     */
    once: function(node, r) {
      if(node.v.length && node.v[0].length) {
        return XPR.string(node.v[0]);
      }
      if(r.v == Infinity) return XPR.string('');
      if(r.t === 'num' && r.v === 0) return XPR.string('');
      return XPR.string(r.v);
    },
    pi: function() { return XPR.number(Math.PI); },
    position: function(r) {
      var position = 1;
      if(r) {
        var node = r.iterateNext();
        var nodeName = node.tagName;
        while (node.previousElementSibling && node.previousElementSibling.tagName === nodeName) {
          node = node.previousElementSibling;
          position++;
        }
      }
      return XPR.number(position);
    },
    pow: function(x, y) { return XPR.number(Math.pow(_float(x), _float(y))); },
    random: function() { return XPR.number(Math.random()); },
    randomize: function(r) {
      if(arguments.length === 1) throw TOO_FEW_ARGS;//only rT passed
      if(arguments.length > 3) throw TOO_MANY_ARGS;

      var seed = arguments.length > 2 ? arguments[1] : arguments[2];
      var rt = arguments[arguments.length - 1];

      if(rt === XPathResult.BOOLEAN_TYPE) {
        return XPR.boolean(r.v.length > 0 ? true : false);
      }
      if(rt === XPathResult.STRING_TYPE) {
        if (r.v.length < 1) return '';
        return XPR.string(r.v[0]);
      }
      // nodes as seed
      if(Array.isArray(seed) && seed.length && seed[0].nodeType === 1) {
        return [r, parseInt(seed[0].textContent)];
      }
      return [r, seed && seed.v];
    },
    regex: function(haystack, pattern) {
        return XPR.boolean(new RegExp(_str(pattern)).test(_str(haystack))); },
    round: function(number, num_digits) {
      if(arguments.length === 0) throw TOO_FEW_ARGS;
      if(arguments.length > 2) throw TOO_MANY_ARGS;
      number = _float(number);
      if(!num_digits) {
        return XPR.number(_round(number));
      }
      num_digits = _int(num_digits);
      var pow = Math.pow(10, Math.abs(num_digits));
      if(num_digits > 0) {
        return XPR.number(_round(number * pow) / pow);
      } else {
        return XPR.number(pow * _round(number / pow));
      }
    },
    selected: function(haystack, needle) {
      return XPR.boolean(_str(haystack).split(' ').indexOf(_str(needle).trim()) !== -1);
    },
    'selected-at': function(list, index) {
      if(!index) throw new Error(JSON.stringify(list));
      return XPR.string(_str(list).split(' ')[_int(index)] || '');
    },
    sin: function(r) { return XPR.number(Math.sin(r.v)); },
    sqrt: function(r) { return XPR.number(Math.sqrt(r.v)); },
    substr: function(string, startIndex, endIndex) {
      return XPR.string(_str(string).slice(
          _int(startIndex),
          endIndex && _int(endIndex)));
    },
    sum: function(r) {
      if(arguments.length > 1) throw TOO_MANY_ARGS;
      var out = 0;
      for (var i = 0; i < r.v.length; i++) {
        if(!RAW_NUMBER.test(r.v[i])) XPR.number(NaN);
        out += parseInt(r.v[i], 10);
      }
      return XPR.number(out);
    },
    tan: function(r) { return XPR.number(Math.tan(r.v)); },
    'true': function(rt) {
      if(rt === XPathResult.NUMBER_TYPE) return XPR.number(1);
      if(arguments.length>1) throw TOO_MANY_ARGS;
      return XPR.boolean(true);
    },
    uuid: function(r) {
      if(r && r.v) return XPR.string(_randomToken(r.v));
      return XPR.string(uuid());
    },
    'weighted-checklist': function(min, max) {
      var i, values = [], weights = [], weightedTrues = 0;
      min = min.v;
      max = max.v;
      for (i=2 ; i < arguments.length ; i=i+2) {
        var v = arguments[i];
        var w = arguments[i+1];
        if (v && w) {
          // value or weight might be a nodeset
          values.push(v.t === 'arr' ? v.v[0] : v.v);
          weights.push(w.t === 'arr' ? w.v[0] : w.v);
        }
      }

      for(i=0; i < values.length; i++) {
        if(Boolean(values[i])) {
          weightedTrues += weights[i];
        }
      }
      return XPR.boolean((min < 0 || weightedTrues >= min) && (max < 0 || weightedTrues <= max));
    }
  };

  // function aliases
  func['date-time'] = func.date;
  func['decimal-date-time'] = func['decimal-date'];
  func['format-date-time'] = func['format-date'];

  process = {
      toExternalResult: function(r) {
        if(r.t === 'date') return {
          resultType:XPathResult.STRING_TYPE,
          // TODO a bit naughty, but we return both a string and number value
          // for dates.  We should actually know from where the xpath evaluator
          // was initially called whether we expect a STRING_TYPE or NUMBER_TYPE
          // result, but we should get away with it because:
          //   1. this setup makes testing easy
          //   2. dates should never leak outside openrosa functionality anyway
          numberValue:r.v.getTime(),
          stringValue:_dateToString(r.v),
        };
      },
      typefor: function(val) {
        if(val instanceof Date) return 'date';
      },
      handleInfix: function(err, lhs, op, rhs) {
        if(lhs.t === 'date' || rhs.t === 'date') {
          // For comparisons, we must make sure that both values are numbers
          // Dates would be fine, except for equality!
          if( op.v === '=' ||
              op.v === '<' ||
              op.v === '>' ||
              op.v === '<=' ||
              op.v === '>=' ||
              op.v === '!=') {
            if(lhs.t === 'arr' || lhs.t === 'str') lhs = date(lhs);
            if(rhs.t === 'arr' || rhs.t === 'str') rhs = date(rhs);
            if(lhs.t !== 'date' || rhs.t !== 'date') {
              return op.v === '!=';
            } else {
              lhs = { t:'num', v:lhs.v.getTime() };
              rhs = { t:'num', v:rhs.v.getTime() };
            }
          } else if(op.v === '+' || op.v === '-') {
            // for math operators, we need to do it ourselves
            if(lhs.t === 'date' && rhs.t === 'date') err();
            var d = lhs.t === 'date'? lhs.v: rhs.v,
                n = lhs.t !== 'date'? _int(lhs): _int(rhs),
                res = new Date(d.getTime());
            if(op.v === '-') n = -n;
            res.setDate(d.getDate() + n);
            return res;
          }
          return { t:'continue', lhs:lhs, op:op, rhs:rhs };
        }
      },
  };

  ret.func = func;
  ret.process = process;
  ret.XPR = XPR;
  ret._now = function(resetTime) {
    var t = new Date();
    if(resetTime) {
      return new Date(t.getFullYear(), t.getMonth(), t.getDate())
    }
    return t;
  };

  return ret;
};

module.exports = openrosa_xpath_extensions;
