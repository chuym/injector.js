(function(factory) {

    // Establish the root object, `window` (`self`) in the browser, or `global` on the server.
    // We use `self` instead of `window` for `WebWorker` support.
    var root = (typeof self == 'object' && self.self == self && self) ||
        (typeof global == 'object' && global.global == global && global);

    // Start with AMD.
    if (typeof define === 'function' && define.amd) {
        define([], function() {
        // Export global even in AMD case in case this script is loaded with
        // others that may still expect a global injector.
        root.injector = factory(root);
    });

    // Next for Node.js or CommonJS. jQuery may not be needed as a module.
    } else if (typeof exports !== 'undefined') {
        module.exports = factory(root);

    // Finally, as a browser global.
    } else {
        root.injector = factory(root);
    }

}(function(root) {

    var injector = {};

    injector.InjectionMapping = function(type, name, id) {
        this._type = type;
        this._name = name;
        this._id = id;

        this._value = null;
        this._toType = null;

        this._isValid = function() {
            return this._value!=null || this._toType!=null;
        };

        this._validateBeforeCreation = function() {
            if(this._isValid()) {
                throw new Error("Could not create mapping for "+this._id+" because it already has been defined");
                return false;
            }

            return true;
        };
    };

    injector.InjectionMapping.prototype = {
        toValue: function(value) {
            if(!this._validateBeforeCreation()) {
                return;
            }

            this._value = value;
        },

        toType: function(type) {
            if(!this._validateBeforeCreation()) {
                return;
            }

            this._toType = type;
        },

        toSingleton: function(type) {
            this.toValue(new type());
        },

        getValue: function() {
            if(!this._isValid()) {
                throw new Error("Could not get value for "+this._id+" because the mapping is invalid");
                return;
            }

            if(this._value!=null) {
                return this._value;
            } else if(this._toType!=null) {
                return new this._toType();
            }
        }
    };
    injector.Injector = function(parentInjector) {
        this._mappings = {};
        this._parentInjector = null;

        this._createMapping = function(type, name, id) {
            if(this._hasOwnMapping(type, name)) {
                throw new Error("Already has mapping for " + type);
                return;
            }

            var mapping = new injector.InjectionMapping(type, name, id);
            this._mappings[id] = mapping;

            return mapping;
        };

        this._getMappingID = function (type, name) {
            name = name == undefined ? '' : name;
            return type + '|' + name;
        };

        this._hasOwnMapping = function(type, name) {
            var mappingID = this._getMappingID(type, name);
            return (this._mappings[mappingID] !== undefined);
        };

        this._postConstruct = function(object) {
            var postConstructs = object.postConstructs!== undefined ? object.postConstructs instanceof Array ? object.postConstructs : [] : [],
                index,
                methodName,
                method;

            for(index in postConstructs) {
                methodName = postConstructs[index];
                method = object[methodName]=== undefined ? null : object[methodName];

                if(typeof method === 'function') {
                    method.apply(object);
                }
            }
        };

        this.map('injector').toValue(this);
        this._parentInjector = parentInjector || null;
    };

    injector.Injector.prototype = {

        map: function(type, name) {
            var mappingID = this._getMappingID(type, name);
            return this._mappings[mappingID] || this._createMapping(type, name, mappingID);
        },

        unmap: function(type, name) {
            if(this.hasMapping(type, name)) {
                var mappingID = this._getMappingID(type, name);
                delete this._mappings[mappingID];
            } else {
                var nameError = name == undefined ? "" : " by name "+ name;
                throw new Error("Cannot unmap \"" + type + nameError + "\" because no mapping has been found");
            }
        },

        hasMapping: function(type, name) {
            return this._hasOwnMapping(type, name) || (this._parentInjector !== null && this._parentInjector.hasMapping(type, name));
        },

        hasDirectMapping: function(type, name) {
            return this._hasOwnMapping(type, name);
        },

        getInstance: function(type, name) {
            if(this.hasMapping(type, name)) {
                return this.getMapping(type, name).getValue();
            } else {
                var nameError = name == undefined ? "" : " by name "+ name;
                throw new Error("Cannot return instance \"" + type + nameError + "\" because no mapping has been found");
            }
        },

        getMapping: function(type, name) {
            if(this.hasMapping(type, name)) {
                var mappingID = this._getMappingID(type, name);
                if(this._mappings[mappingID] !== undefined) {
                    return this._mappings[mappingID];
                } else {
                    return this.getParentInjector().getMapping(type, name);
                }
            } else {
                var nameError = name == undefined ? "" : " by name "+ name;
                throw new Error("Mapping \"" + type + nameError + "\" was not found");
            }
        },

        injectInto: function(object) {
            var member, injectionObject;

            for (member in object) {

                injectionObject = injector.utils.stringToObject(member, object[member]);

                if(injectionObject!=null) {
                    if(this.hasMapping(injectionObject.type, injectionObject.name)) {
                        object[member] = this.getInstance(injectionObject.type, injectionObject.name);
                    } else {
                        throw new Error("Cannot inject "+injectionObject.type+" into "+object+" due to a missing rule");
                    }
                }
            }

            this._postConstruct(object);
        },

        teardown: function() {
            this._mappings = {};
            this.map('injector').toValue(this);
        },

        getParentInjector: function() {
            return this._parentInjector;
        },

        setParentInjector: function(parentInjector) {
            if(parentInjector != null && !(parentInjector instanceof injector.Injector)) {
                throw new Error('Cannot set the parentInjector because it is not an injector');
            }

            this._parentInjector = parentInjector;
        },

        createChildInjector: function() {
            return new injector.Injector(this);
        }

    };
    injector.utils = {};
    /**
     * Parse the value of a object to find out how we should inject
     * @param type The default type in the mapping. Could be overridden by injectionString
     * @param injectionString the value of the variable you want to inject into. Should be a string, else we return null
     *        String could be formatted like the following examples
     *
     *          - inject                        - Will in the end inject by type argument
     *          - inject:someValue              - Will override the type argument by the type after the colon
     *          - inject(name="one"):someValue  - Will use named injection with a custom type
     *          - inject(name="one")            - Will inject by name
     */
    injector.utils.stringToObject = function(type, injectionString) {
        if(typeof injectionString !== "string")
            return null;

        var injectionObject = { name:'', type:type },
            startsWithInjectRegExp = new RegExp('^inject'),
            //injectionNameRegExp = new RegExp(/(?<=name=")[^]+?(?=")/), // contains a lookbehind, which is not supported by JS
            injectionNameRegExp = new RegExp(/[\w:\-]?name[\s]*?=[\s]*?("[^"]+"|'[^']+'|\w+)/),
            toTypeRegExp = new RegExp(':[^:]+$'), //This will return everything from the last colon (including the colon)
            name, toType;

        if(injectionString=='inject') {
            //Simple injection
            return injectionObject;
        } else if (injectionString.match(startsWithInjectRegExp)) {
            name = injectionNameRegExp.exec(injectionString);
            toType = toTypeRegExp.exec(injectionString);
            injectionObject.name = name != null && name.length==2 ? name[1].replace(/"/gm,"") : '';
            injectionObject.type = toType != null && toType.length==1 ? toType[0].replace(':','') : type; //If we did match a type specification, then strip of the colon, else use the input type

            return injectionObject;
        }

        return null;
    };

    root.injector = injector;
    return injector;
}));
