// Weather module for Kindle Clock
// Uses Open-Meteo API (free, no API key required)
// Caches weather data for 1 hour in localStorage

var weather = {
  CACHE_KEY: 'kindle_weather_cache_v4', // v4 for 1-day forecast with labels
  CACHE_DURATION: 3600000, // 1 hour in milliseconds

  // Weather code to emoji and description mapping (Open-Meteo codes)
  weatherCodes: {
    0: { icon: '☀', text: '晴朗' }, // Clear sky
    1: { icon: '🌤', text: '晴朗' }, // Mainly clear
    2: { icon: '⛅', text: '多云' }, // Partly cloudy
    3: { icon: '☁', text: '阴天' }, // Overcast
    45: { icon: '🌫', text: '雾' }, // Fog
    48: { icon: '🌫', text: '雾' }, // Depositing rime fog
    51: { icon: '🌦', text: '小雨' }, // Light drizzle
    53: { icon: '🌦', text: '中雨' }, // Moderate drizzle
    55: { icon: '🌧', text: '大雨' }, // Dense drizzle
    56: { icon: '🌧', text: '冻雨' }, // Light freezing drizzle
    57: { icon: '🌧', text: '冻雨' }, // Dense freezing drizzle
    61: { icon: '🌧', text: '小雨' }, // Slight rain
    63: { icon: '🌧', text: '中雨' }, // Moderate rain
    65: { icon: '🌧', text: '大雨' }, // Heavy rain
    66: { icon: '🌧', text: '冻雨' }, // Light freezing rain
    67: { icon: '🌧', text: '冻雨' }, // Heavy freezing rain
    71: { icon: '🌨', text: '小雪' }, // Slight snow fall
    73: { icon: '❄', text: '中雪' }, // Moderate snow fall
    75: { icon: '❄', text: '大雪' }, // Heavy snow fall
    77: { icon: '❄', text: '雪粒' }, // Snow grains
    80: { icon: '🌦', text: '阵雨' }, // Slight rain showers
    81: { icon: '🌧', text: '阵雨' }, // Moderate rain showers
    82: { icon: '🌧', text: '大阵雨' }, // Violent rain showers
    85: { icon: '🌨', text: '阵雪' }, // Slight snow showers
    86: { icon: '❄', text: '大阵雪' }, // Heavy snow showers
    95: { icon: '⛈', text: '雷暴' }, // Thunderstorm
    96: { icon: '⛈', text: '雷雨' }, // Thunderstorm with slight hail
    99: { icon: '⛈', text: '雷雨' }  // Thunderstorm with heavy hail
  },

  /**
   * Get weather icon and text from weather code
   */
  getWeatherInfo: function(code) {
    var info = this.weatherCodes[code];
    if (info) {
      return info;
    }
    // Default fallback
    return { icon: '🌡', text: '未知' };
  },

  /**
   * Check if cached weather data is still valid
   */
  isCacheValid: function(timestamp) {
    var now = new Date().getTime();
    return (now - timestamp) < this.CACHE_DURATION;
  },

  /**
   * Get weather data from localStorage cache
   */
  getWeatherFromCache: function() {
    try {
      var cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) {
        return null;
      }

      var data = JSON.parse(cached);
      if (!data || !data.timestamp) {
        return null;
      }

      // Check if cache is still valid
      if (this.isCacheValid(data.timestamp)) {
        return {
          temp: data.temp,
          icon: data.icon,
          condition: data.condition
        };
      }

      // Cache expired, remove it
      localStorage.removeItem(this.CACHE_KEY);
      return null;
    } catch (e) {
      // localStorage might not be available or JSON parse failed
      return null;
    }
  },

  /**
   * Save weather data to localStorage cache
   */
  saveWeatherToCache: function(weatherData) {
    try {
      var cacheData = {
        temp: weatherData.temp,
        icon: weatherData.icon,
        condition: weatherData.condition,
        timestamp: new Date().getTime()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      // Fail silently if localStorage is not available
    }
  },

  /**
   * Fetch weather data from Open-Meteo API
   */
  fetchWeather: function(lat, lon, callback) {
    var url = 'https://api.open-meteo.com/v1/forecast?' +
              'latitude=' + lat +
              '&longitude=' + lon +
              '&current=temperature_2m,weather_code' +
              '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
              '&timezone=auto' +
              '&forecast_days=2';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          var weatherData = weather.parseWeatherData(data);
          callback(null, weatherData);
        } catch (e) {
          callback(new Error('Failed to parse weather data'));
        }
      } else {
        callback(new Error('Weather API request failed'));
      }
    };

    xhr.onerror = function() {
      callback(new Error('Network error'));
    };

    xhr.send();
  },

  /**
   * Parse Open-Meteo API response
   */
  parseWeatherData: function(data) {
    if (!data || !data.current) {
      throw new Error('Invalid weather data');
    }

    var tempC = data.current.temperature_2m;
    var tempF = Math.round((tempC * 9/5) + 32); // Convert C to F
    var weatherCode = data.current.weather_code;
    var weatherInfo = this.getWeatherInfo(weatherCode);

    var result = {
      temp: tempF,
      icon: weatherInfo.icon,
      condition: weatherInfo.text
    };

    // Add tomorrow's forecast if available
    if (data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_min && data.daily.time.length > 1) {
      var maxC = data.daily.temperature_2m_max[1];
      var minC = data.daily.temperature_2m_min[1];
      var maxF = Math.round((maxC * 9/5) + 32);
      var minF = Math.round((minC * 9/5) + 32);
      var forecastCode = data.daily.weather_code[1];
      var forecastInfo = this.getWeatherInfo(forecastCode);

      result.forecast = {
        max: maxF,
        min: minF,
        icon: forecastInfo.icon
      };
    }

    return result;
  },

  /**
   * Geocode city name to coordinates using Open-Meteo Geocoding API
   */
  geocodeCity: function(cityName, callback) {
    // If city includes comma (e.g., "New York,NY"), use only the city part
    var searchName = cityName.split(',')[0].trim();

    var url = 'https://geocoding-api.open-meteo.com/v1/search?' +
              'name=' + encodeURIComponent(searchName) +
              '&count=1' +
              '&language=en' +
              '&format=json';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.results && data.results.length > 0) {
            var result = data.results[0];
            callback(null, {
              lat: result.latitude,
              lon: result.longitude,
              name: result.name,
              country: result.country
            });
          } else {
            callback(new Error('City not found'));
          }
        } catch (e) {
          callback(new Error('Failed to parse geocoding data'));
        }
      } else {
        callback(new Error('Geocoding API request failed'));
      }
    };

    xhr.onerror = function() {
      callback(new Error('Network error during geocoding'));
    };

    xhr.send();
  },

  /**
   * Main function to update weather display
   * Can accept either lat/lon OR cityName
   */
  updateWeather: function(lat, lon, domElement) {
    if (!domElement) {
      return;
    }

    // Check cache first
    var cached = this.getWeatherFromCache();
    if (cached) {
      this.displayWeather(cached, domElement);
      return;
    }

    // Fetch fresh data
    this.fetchWeather(lat, lon, function(error, weatherData) {
      if (error) {
        // Fail silently, don't show error to user
        console.error('Weather fetch failed:', error);
        return;
      }

      // Save to cache and display
      weather.saveWeatherToCache(weatherData);
      weather.displayWeather(weatherData, domElement);
    });
  },

  /**
   * Display weather in DOM element
   */
  displayWeather: function(weatherData, domElement) {
    if (domElement && weatherData) {
      // Today's weather inline (temp and icon on same row)
      var html = weatherData.temp + '°F ' + weatherData.icon;

      // Tomorrow's forecast at bottom right, all on one line
      if (weatherData.forecast) {
        html += '<div style="position:absolute;bottom:-2.5rem;right:0;font-size:0.6em;white-space:nowrap">' +
                '<span style="opacity:0.7">明天</span> ' +
                weatherData.forecast.max + '/' + weatherData.forecast.min + '°F ' +
                weatherData.forecast.icon + '</div>';
      }

      domElement.innerHTML = html;
    }
  },

  /**
   * Update weather by city name (geocodes first, then fetches weather)
   */
  updateWeatherByCity: function(cityName, domElement) {
    if (!domElement || !cityName) {
      return;
    }

    var self = this;

    // Check cache first
    var cached = this.getWeatherFromCache();
    if (cached) {
      this.displayWeather(cached, domElement);
    }

    // Geocode city to get coordinates
    this.geocodeCity(cityName, function(error, location) {
      if (error) {
        console.error('Geocoding failed:', error);
        return;
      }

      // Now fetch weather using the coordinates
      self.fetchWeather(location.lat, location.lon, function(error, weatherData) {
        if (error) {
          console.error('Weather fetch failed:', error);
          return;
        }

        // Save to cache and display
        self.saveWeatherToCache(weatherData);
        self.displayWeather(weatherData, domElement);
      });
    });
  }
};
