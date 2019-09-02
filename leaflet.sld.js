(function() {

// default Path style applied if nothing matches
var defaultStyle = {
   stroke: true,
   color: "#03f",
   weight: 1,
   opacity: 1,
   fillOpacity: 1,
   fillColor: '#03f',
   strokeOpacity: 1,
   strokeWidth: 1,
   strokeDashstyle: "solid",
   pointRadius: 3,
   dashArray: null,
   lineJoin: null,
   lineCap: null,

};

var type;

// attributes converted to numeric values
var numericAttributes = ['weight', 'opacity', 'fillOpacity', 'strokeOpacity'];

// mapping between SLD attribute names and SVG names
var attributeNameMapping = {
   'stroke': 'color',
   'stroke-width': 'weight',
   'stroke-opacity': 'opacity',
   'fill-opacity': 'fillOpacity',
   'fill': 'fillColor',
   'stroke-opacity': 'strokeOpacity',
   'stroke-dasharray': 'dashArray',
   //strokeDashstyle,
   //pointRadius,
   'stroke-linejoin': 'lineJoin',
   'stroke-linecap': 'lineCap',
   // NH
   'size': 'radius'
};

// mapping SLD operators to shortforms
var comparisionOperatorMapping = {
   'ogc:PropertyIsEqualTo': '==',
   'ogc:PropertyIsNotEqualTo': '!=',
   'ogc:PropertyIsLessThan': '<',
   'ogc:PropertyIsGreaterThan': '>',
   'ogc:PropertyIsLessThanOrEqualTo': '<=',
   'ogc:PropertyIsGreaterThanOrEqualTo': '>=',
   //'ogc:PropertyIsNull': 'isNull',
   //'ogc:PropertyIsBetween'
   // ogc:PropertyIsLike
};

// namespaces for Tag lookup in XML
var namespaceMapping = {
   se: 'http://www.opengis.net/se',
   ogc: 'http://www.opengis.net/ogc',
   sld: 'http://www.opengis.net/sld'
};

function getTagNameArray(element, tagName, childrens) {

   var tagParts = tagName.split(':');
   var ns = null;
   var tags;

   if (tagParts.length == 2) {
      ns = tagParts[0];
      tagName = tagParts[1];
   }

   if(typeof(childrens) !== 'undefined' && childrens) {
      tags = [].filter.call(
         element.children,
         function(element) {
            return element.tagName === ns + ':' + tagName
         }
      )
   } else
      tags = [].slice.call(element.getElementsByTagNameNS(
         namespaceMapping[ns],
         tagName
      ));

   if(!tags.length && ns === 'se')
      return getTagNameArray(element, 'sld:' + tagName, childrens);
   else
      return tags;
};



/**
 * SLD Styler. Reads SLD 1.1.0.
 *
 */
L.SLDStyler = L.Class.extend({
   // none yet
   //type: null,
   options: {
      type: this.type
   },
   initialize: function(sldStringOrXml, options) {
      L.Util.setOptions(this, options);
      if (sldStringOrXml !== undefined) {
         this.featureTypeStylesNameMap = {};
         this.featureTypeStyles = this.parse(sldStringOrXml);
         //this.type = this.determineType(sldStringOrXml);
      }
   },

   //determineType: function(sldStringOrXml) {
   //   var x = sldStringOrXml;
   //   if (x.includes('Line')) {
   //      console.log('Line')
   //      type = 'Line'
   //   } else if (x.includes('Polygon')) {
   //      console.log('Polygon')
   //      type = 'Polygon'
   //   } else if (x.includes('Point')) {
   //      console.log('Point')
   //      type = 'Point'
   //   }
   //   return type
   //},

   

   // translates PolygonSymbolizer attributes into Path attributes
   parseSymbolizer: function(symbolizer) {
      // SvgParameter names below se:Fill and se:Stroke
      // are unique so don't bother parsing them seperatly.
      var parameters = getTagNameArray(symbolizer, 'se:SvgParameter');
      var cssParams = L.extend({}, defaultStyle);

      if(!parameters.length)
         parameters = getTagNameArray(symbolizer, 'se:CssParameter');

      parameters.forEach(function(param) {
         var key = param.getAttribute('name');
         var mappedKey = attributeNameMapping[key];
         if (false == (mappedKey in cssParams)) {
            console.error("Ignorning unknown SvgParameter name", key);
         } else {
            var value = param.textContent;
            if (numericAttributes.indexOf(mappedKey) > -1) {
               value = parseFloat(value, 10);
            } else if (mappedKey === 'dashArray') {
               value = value.split(' ').join(', ');
            }
            cssParams[mappedKey] = value;
         }
      });
      return cssParams;
   },
   parseFilter: function(filter) {
      if(filter) {
         var hasAnd = getTagNameArray(filter, 'ogc:And').length;
         var hasOr = getTagNameArray(filter, 'ogc:Or').length;
         var filterJson = {
            operator: hasAnd == true ? 'and' : hasOr ?  'or' : null,
            comparisions: []
         };
         Object.keys(comparisionOperatorMapping).forEach(function(key) {
            var comparisionElements = getTagNameArray(filter, key);
            var comparisionOperator = comparisionOperatorMapping[key];
            comparisionElements.forEach(function(comparisionElement) {
               var property = getTagNameArray(comparisionElement, 'ogc:PropertyName')[0].textContent;
               var literal = getTagNameArray(comparisionElement, 'ogc:Literal')[0].textContent;
               filterJson.comparisions.push({
                  operator: comparisionOperator,
                  property: property,
                  literal: literal
               })
            })
         });
         return filterJson;
      }
   },
   parseRule: function(rule, xmlDoc) {
      var filter = getTagNameArray(rule, 'ogc:Filter')[0];
      var symbolizer;
      console.log(typeof this.options.type) // Line

      if (this.options.type === 'Polygon') {
         symbolizer = getTagNameArray(rule, 'se:PolygonSymbolizer')[0]; // NH this is why it was failing
      } else if (this.options.type === 'Line') {
         symbolizer = getTagNameArray(rule, 'se:LineSymbolizer')[0];
      } else if (this.options.type === 'Point') {
         symbolizer = getTagNameArray(rule, 'se:PointSymbolizer')[0];
      }

      return {
         filter: this.parseFilter(filter),
         symbolizer: this.parseSymbolizer(symbolizer)
      }
   },
   parse: function(sldStringOrXml) {
      var xmlDoc = sldStringOrXml;
      var self = this;

      if (typeof(sldStringOrXml) === 'string') {
         console.log("NH1")
         var parser = new DOMParser();
         xmlDoc = parser.parseFromString(sldStringOrXml, "text/xml");
      }
      var featureTypeStyles = getTagNameArray(xmlDoc, 'se:FeatureTypeStyle');
      window.xmlDoc = xmlDoc;

      featureTypeStyles.forEach(function(element, idx) {
         var layerName = getTagNameArray(
            element.parentElement.parentElement,
            'se:Name',
            true
         ).map(function (node) {
            return node.innerHTML;
         });

         if(layerName.length) {
            self.featureTypeStylesNameMap[layerName] = idx;
         }
      });

      return featureTypeStyles.map(function(featureTypeStyle) {
         var rules = getTagNameArray(featureTypeStyle, 'se:Rule');
         var name = getTagNameArray(
               featureTypeStyle.parentElement,
               'se:Name',
               true
            ).map(function(node) {
               return node.innerHTML;
            });

         if(!name.length)
            name = null;
         else
            name = name[0];

         return {
            'name' : name,
            'rules': rules.map(function(rule) {
               return this.parseRule(rule, xmlDoc);
            }, this)
         };
      }, this);
   },
   isFilterMatch: function(filter, properties) {
      if (filter) {
         var operator = filter.operator == null || filter.operator == 'and' ? 'every' : 'some';
         return filter.comparisions[operator](function(comp) {
            if (comp.operator == '==') {
               return properties[comp.property] == comp.literal;
            } else if (comp.operator == '!=') {
               return properties[comp.property] == comp.literal;
            } else if (comp.operator == '<') {
               return properties[comp.property] < comp.literal;
            } else if (comp.operator == '>') {
               return properties[comp.property] > comp.literal;
            } else if (comp.operator == '<=') {
               return properties[comp.property] <= comp.literal;
            } else if (comp.operator == '>=') {
               return properties[comp.property] >= comp.literal;
            } else {
               console.error('Unknown comparision operator', comp.operator);
            }
         });
      } else
         return true;
   },
   matchFn: function (featureTypeStyle, feature) {
      var matchingRule = null;

      featureTypeStyle.rules.some(function (rule) {
         if (this.isFilterMatch(rule.filter, feature.properties)) {
            matchingRule = rule;
            return true;
         }
      }, this);

      return matchingRule;
   },
   styleFn: function (indexOrName, feature) {
      var matchingRule = null;

      if (typeof (indexOrName) !== 'undefined') {
         if (
            typeof (indexOrName) === "string" &&
            indexOrName in this.featureTypeStylesNameMap
         ) {
            indexOrName = this.featureTypeStylesNameMap[indexOrName];
         } else {
            console.error("Unknown layer style '" + indexOrName + "'.")
            return {};
         }

         if(indexOrName in this.featureTypeStyles) {
            matchingRule = this.matchFn(
               this.featureTypeStyles[indexOrName],
               feature
            )
         } else {
            console.error("Unkonwn style index " + indexOrName)
            return {}
         }
      } else
         this.featureTypeStyles.some(function (featureTypeStyle) {
            matchingRule = this.matchFn(featureTypeStyle, feature)
         }, this);

      if (matchingRule != null) {
         return matchingRule.symbolizer;
      }

      return {};
   },

   getAttributes: function() {
      //console.log(this)
      //console.log(getTagNameArray)
      //console.log(this.featureTypeStyles)
      //console.log(this.xmlDoc)

   },
   getStyleFunction: function (indexOrName) {
      return this.styleFn.bind(this, indexOrName);
   },

   
});


L.SLDStyler.defaultStyle = defaultStyle;

})();