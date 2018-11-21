var monereumMarket = AmCharts.makeChart( "market", {
  "type": "stock",
  "theme": "light",

  //"color": "#fff",
  "dataSets": [ {
    "title": "Monereum",
    "fieldMappings": [ {
      "fromField": "Open",
      "toField": "open"
    }, {
      "fromField": "High",
      "toField": "high"
    }, {
      "fromField": "Low",
      "toField": "low"
    }, {
      "fromField": "Close",
      "toField": "close"
    }, {
      "fromField": "Volume",
      "toField": "volume"
    } ],
    "compared": false,
    "categoryField": "Date",

    /**
     * data loader for data set data
     */
    "dataLoader": {
      "url": "https://www.amcharts.com/wp-content/uploads/assets/stock/MSFT.csv",
      "format": "csv",
      "showCurtain": true,
      "showErrors": true,
      "async": true,
      "reverse": true,
      "delimiter": ",",
      "useColumnNames": true,
      "reload": 30,
    },

  } ],
  "dataDateFormat": "YYYY-MM-DD",

  "panels": [ {
      "title": "Value",
      "percentHeight": 70,

      "stockGraphs": [ {
        "type": "candlestick",
        "id": "g1",
        "openField": "open",
        "closeField": "close",
        "highField": "high",
        "lowField": "low",
        "valueField": "close",
        "lineColor": "#0f0",
        "fillColors": "#0f0",
        "negativeLineColor": "#f00",
        "negativeFillColors": "#f00",
        "fillAlphas": 1,
        "comparedGraphLineThickness": 2,
        "columnWidth": 0.7,
        "useDataSetColors": false,
        "comparable": true,
        "compareField": "close",
        "showBalloon": false,
        "proCandlesticks": false
      } ],

      "stockLegend": {
        "valueTextRegular": undefined,
        "periodValueTextComparing": "[[percents.value.close]]%"
      }

    },

    {
      "title": "Volume",
      "percentHeight": 30,
      "marginTop": 1,
      "columnWidth": 0.6,
      "showCategoryAxis": false,

      "stockGraphs": [ {
        "valueField": "volume",
        "openField": "open",
        "type": "column",
        "showBalloon": false,
        "fillAlphas": 1,
        "lineColor": "#fff",
        "fillColors": "#fff",
        "negativeLineColor": "#db4c3c",
        "negativeFillColors": "#db4c3c",
        "useDataSetColors": false,
        "comparable": true,
        "compareField": "volume",
      } ],

      "stockLegend": {
        "markerType": "none",
        "markerSize": 0,
        "labelText": "",
        "periodValueTextRegular": "[[value.close]]"
      },

      "valueAxes": [ {
        "usePrefixes": true
      } ]
    }
  ],

  "panelsSettings": {
    //    "color": "#fff",
    "plotAreaFillColors": "#333",
    "plotAreaFillAlphas": 1,
    "marginLeft": 60,
    "marginTop": 5,
    "marginBottom": 5
  },

  "chartScrollbarSettings": {
    "graph": "g1",
    "graphType": "line",
    "usePeriod": "WW",
    "backgroundColor": "#444",
    "backgroundAlpha": 1,
    "graphFillColor": "#777",
    "graphFillAlpha": 1,
    "gridColor": "#555",
    "gridAlpha": 1,
    "selectedBackgroundColor": "#fff",
    "selectedBackgroundAlpha": 1,
    "selectedGridColor": "#555",
    "selectedGraphFillAlpha": 1
  },

  "categoryAxesSettings": {
    "equalSpacing": true,
    "gridColor": "#555",
    "gridAlpha": 1
  },

  "valueAxesSettings": {
    "gridColor": "#555",
    "gridAlpha": 1,
    "inside": false,
    "showLastLabel": true
  },

  "chartCursorSettings": {
    "pan": true,
    "valueLineEnabled": true,
    "valueLineBalloonEnabled": true
  },

  "legendSettings": {
    //"color": "#fff"
  },

  "stockEventsSettings": {
    "showAt": "high",
    "type": "pin"
  },

  "balloon": {
    "textAlign": "left",
    "offsetY": 10
  },

  "periodSelector": {
    "position": "bottom",
    "periods": [ {
        "period": "DD",
        "count": 10,
        "label": "10D"
      }, {
        "period": "MM",
        "count": 1,
        "label": "1M"
      }, {
        "period": "MM",
        "count": 6,
        "label": "6M"
      }, {
        "period": "YYYY",
        "count": 1,
        "label": "1Y"
      }, {
        "period": "YYYY",
        "count": 2,
        "selected": true,
        "label": "2Y"
      },
      /* {
           "period": "YTD",
           "label": "YTD"
         },*/
      {
        "period": "MAX",
        "label": "MAX"
      }
    ]
  }
} );
