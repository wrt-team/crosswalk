/**
 * almond 0.0.3 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
/*jslint strict: false, plusplus: false */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {

    var defined = {},
        waiting = {},
        aps = [].slice,
        main, req;

    if (typeof define === "function") {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseName = baseName.split("/");
                baseName = baseName.slice(0, baseName.length - 1);

                name = baseName.concat(name.split("/"));

                //start trimDots
                var i, part;
                for (i = 0; (part = name[i]); i++) {
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            }
        }
        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (waiting.hasOwnProperty(name)) {
            var args = waiting[name];
            delete waiting[name];
            main.apply(undef, args);
        }
        return defined[name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    function makeMap(name, relName) {
        var prefix, plugin,
            index = name.indexOf('!');

        if (index !== -1) {
            prefix = normalize(name.slice(0, index), relName);
            name = name.slice(index + 1);
            plugin = callDep(prefix);

            //Normalize according
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            p: plugin
        };
    }

    main = function (name, deps, callback, relName) {
        var args = [],
            usingExports,
            cjsModule, depName, i, ret, map;

        //Use name if no relName
        if (!relName) {
            relName = name;
        }

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Default to require, exports, module if no deps if
            //the factory arg has any arguments specified.
            if (!deps.length && callback.length) {
                deps = ['require', 'exports', 'module'];
            }

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            for (i = 0; i < deps.length; i++) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = makeRequire(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = defined[name] = {};
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = {
                        id: name,
                        uri: '',
                        exports: defined[name]
                    };
                } else if (defined.hasOwnProperty(depName) || waiting.hasOwnProperty(depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw name + ' missing ' + depName;
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef) {
                    defined[name] = cjsModule.exports;
                } else if (!usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = req = function (deps, callback, relName, forceSync) {
        if (typeof deps === "string") {

            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            //Drop the config stuff on the ground.
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = arguments[2];
            } else {
                deps = [];
            }
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 15);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function () {
        return req;
    };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (define.unordered) {
            waiting[name] = [name, deps, callback];
        } else {
            main(name, deps, callback);
        }
    };

    define.amd = {
        jQuery: true
    };
}());
var jWorkflow=function(){return{order:function(h,j){var i=[],f,d=null,g=function(){var a=false;return{take:function(){a=true},pass:function(b){var c;a=false;if(f.length){c=f.shift();b=c.func.apply(c.context,[b,g]);a||g.pass(b)}else d.func&&d.func.apply(d.context,[])}}}(),e={andThen:function(a,b){if(typeof a!=="function")throw"expected function but was "+typeof a;i.push({func:a,context:b});return e},chill:function(a){return e.andThen(function(b,c){c.take();setTimeout(function(){c.pass(b)},a)})},start:function(a,
b){d={func:a,context:b};f=i.slice();g.pass()}};return h?e.andThen(h,j):e}}}();if(typeof module==="object"&&typeof require==="function")module.exports=jWorkflow;
// jXHR.js (JSON-P XHR)
// v0.1 (c) Kyle Simpson
// MIT License

(function(global){
	var SETTIMEOUT = global.setTimeout, // for better compression
		doc = global.document,
		callback_counter = 0;
		
	global.jXHR = function() {
		var script_url,
			script_loaded,
			jsonp_callback,
			scriptElem,
			publicAPI = null;
			
		function removeScript() { try { scriptElem.parentNode.removeChild(scriptElem); } catch (err) { } }
			
		function reset() {
			script_loaded = false;
			script_url = "";
			removeScript();
			scriptElem = null;
			fireReadyStateChange(0);
		}
		
		function ThrowError(msg) {
			try { publicAPI.onerror.call(publicAPI,msg,script_url); } catch (err) { throw new Error(msg); }
		}

		function handleScriptLoad() {
			if ((this.readyState && this.readyState!=="complete" && this.readyState!=="loaded") || script_loaded) { return; }
			this.onload = this.onreadystatechange = null; // prevent memory leak
			script_loaded = true;
			if (publicAPI.readyState !== 4) ThrowError("Script failed to load ["+script_url+"].");
			removeScript();
		}
		
		function fireReadyStateChange(rs,args) {
			args = args || [];
			publicAPI.readyState = rs;
			if (typeof publicAPI.onreadystatechange === "function") publicAPI.onreadystatechange.apply(publicAPI,args);
		}
				
		publicAPI = {
			onerror:null,
			onreadystatechange:null,
			readyState:0,
			open:function(method,url){
				reset();
				internal_callback = "cb"+(callback_counter++);
				(function(icb){
					global.jXHR[icb] = function() {
						try { fireReadyStateChange.call(publicAPI,4,arguments); } 
						catch(err) { 
							publicAPI.readyState = -1;
							ThrowError("Script failed to run ["+script_url+"]."); 
						}
						global.jXHR[icb] = null;
					};
				})(internal_callback);
				script_url = url.replace(/=\?/,"=jXHR."+internal_callback);
				fireReadyStateChange(1);
			},
			send:function(){
				SETTIMEOUT(function(){
					scriptElem = doc.createElement("script");
					scriptElem.setAttribute("type","text/javascript");
					scriptElem.onload = scriptElem.onreadystatechange = function(){handleScriptLoad.call(scriptElem);};
					scriptElem.setAttribute("src",script_url);
					doc.getElementsByTagName("head")[0].appendChild(scriptElem);
				},0);
				fireReadyStateChange(2);
			},
			setRequestHeader:function(){}, // noop
			getResponseHeader:function(){return "";}, // basically noop
			getAllResponseHeaders:function(){return [];} // ditto
		};

		reset();
		
		return publicAPI;
	};
})(window);
define.unordered = true;
define('ripple/constants', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
module.exports = {
    "API_URL": "http://api.tinyhippos.com",

    "RELEASE_VERSION": "simulator-release-version",

    "SERVICES": {
        "GOOGLE_MAPS_URI": "http://maps.google.com/maps/api/staticmap?size=476x476&maptype=roadmap",
        "GOOGLE_MAPS_API_KEY": "ABQIAAAA-CaPZHXR-0Tzhui_h6gpjhSE_2rGlnYiB7L-ZGVwgaut5s7OYRSlBAaHCzBuZf2_23_vrCOfPxXHjA"
    },

    "FS_SIZE": 1024 * 1024 * 10,

    "COMMON":  {
        "APPLICATION_STATE": "ui-application-state-",
        "PREFIX": "tinyhippos-",
        "DEVICE_CONTAINER" : "device-container",
        "MENU_BUTTON" : "menu-button",
        "BACK_BUTTON" : "back-button",
        "HTML_CONTAINER" : "document",
        "INFO_SECTION": "information-sub-container",
        "ORIENTATION_SELECT_PORTRAIT_ID" : "layout-portrait",
        "ORIENTATION_SELECT_LANDSCAPE_ID" : "layout-landscape",
        "PLATFORM_SELECT_ID": "platform-select",
        "DEVICE_SELECT_ID": "device-select",
        "STORAGE_TABLE_BODY_CLASS": "preferences-list-body",
        "STORAGE_COUNT_CONTAINER_ID": "preferences-count",
        "GEO_MAP_CONTAINER_ID": "geo-map",
        "FILESYSTEM_UPDATE_BUTTON_ID_WITH_HASH": "#update-filesystem-button",
        "USER_AGENT_DEFAULT": "default",
        "APPLICATIONS_CONTAINER_ID": "widget-applications-content",
        "STORAGE_CLEAR_BUTTON_ID": "preferences-clear-button",
        "AJAX_LOADER_CONTAINER_CLASS": ".loader",
        "IRRELEVANT_CLASS": "irrelevant",
        "MULTIMEDIA_VOLUME_SLIDER_ID": "media-volume",
        "MULTIMEDIA_VOLUME_FIELD_ID": "media-volume-value",
        "MULTIMEDIA_AUDIO_STATE_FIELD_ID": "media-audio-state",
        "MULTIMEDIA_AUDIO_PLAYING_FIELD_ID": "multimedia-isaudioplaying",
        "MULTIMEDIA_AUDIO_PROGRESS_ID": "media-audio-progress",
        "MULTIMEDIA_AUDIO_FILE_FIELD_ID": "media-audio-file",
        "MULTIMEDIA_VIDEO_STATE_FIELD_ID": "media-video-state",
        "MULTIMEDIA_VIDEO_PLAYING_FIELD_ID": "multimedia-isvideoplaying",
        "MULTIMEDIA_VIDEO_PROGRESS_ID": "media-video-progress",
        "MULTIMEDIA_VIDEO_FILE_FIELD_ID": "media-video-file",
        "EXTENSION_URL_CONTAINER": "extension-url",
        "SECURITY_LEVEL": "security-level"
    },
    "LAUNCHING_HISTORY": "application-launching-history",

    "FILESYSTEM": {
        "PERSISTENCE_KEY": "filesystem",
        "INPUT_PREFIX_ID": "#panel-filesystem-"
    },

    "PLATFORM":  {
        "DEFAULT": {
            "name": "tizen",
            "version": "1.0"
        }
    },

    "DEVICE":  {
        "SAVED_KEY": "device-key"
    },

    "BATTERY":  {
        "TIME": "charging-time",
        "VOLUME": "battery-volume",
        "CHARGING": "is-charging"
    },

    "TOUCHEVENT":  {
        "OPTION": "touch_option",
        "ALTKEY": "touch_altKey",
        "METAKEY": "touch_metaKey",
        "CTRLKEY": "touch_ctrlKey",
        "SHIFTKEY": "touch_shiftKey",
        "CANVAS": "touch_canvas"
    },

    "ENCAPSULATOR":  {
        "DEFAULT_HEIGHT": 684,
        "DEFAULT_WIDTH": 480,
        "LAYOUT": "layout",
        "DISPLAY_LAYOUT": {
            "LANDSCAPE": "landscape",
            "PORTRAIT": "portrait"
        },
        "ZOOMING": "screen-zooming"
    },

    "GEO":  {
        "OPTIONS" : {
            "LATITUDE" : "geo-latitude",
            "LONGITUDE" : "geo-longitude",
            "ALTITUDE" : "geo-altitude",
            "CELL_ID" : "geo-cellid",
            "ACCURACY" : "geo-accuracy",
            "ALTITUDE_ACCURACY" : "geo-altitudeaccuracy",
            "HEADING" : "geo-heading",
            "SPEED" : "geo-speed",
            "TIME_STAMP" : "geo-timestamp",
            "DELAY" : "geo-delay",
            "DELAY_LABEL" : "geo-delay-label",
            "HEADING_LABEL" : "geo-heading-label",
            "HEADING_MAP_LABEL" : "geo-map-direction-label",
            "IMAGE" : "geo-map-img",
            "MAP_CONTAINER" : "geo-map-container",
            "TIMEOUT" : "geo-timeout",
            "GPXFILE": "geo-gpxfile",
            "GPXGO": "geo-gpx-go",
            "GPXMULTIPLIER": "geo-gpxmultiplier-select",
            "GPXREPLAYSTATUS": "geo-gpxreplaystatus"
        },
        "MAP_ZOOM_MAX": 18,
        "MAP_ZOOM_MIN": 0,
        "MAP_ZOOM_LEVEL_CONTAINER": "geo-map-zoomlevel-value",
        "MAP_ZOOM_KEY": "geo-map-zoom-key",
        "GPXGO_LABELS": {

            "GO": "Go",
            "STOP": "Stop"
        }
    },

    "PUSH": {
        "OPTIONS" : {
            "PAYLOAD" : "push-text"
        }
    },

    "TELEPHONY": {
        "CALL_LIST_KEY": "telephony-call-list-key"
    },

    "PIM": {
        "ADDRESS_LIST_KEY": "pim-address-list-key",
        "CALENDAR_LIST_KEY": "pim-calendar-list-key"
    },

    "CAMERA": {
        "WINDOW_ANIMATION": "images/tizen-wave.gif",
        "WARNING_TEXT": "The runtime simulated saving the camera file to {file}. If you need to access this file in your application, please copy a file to the saved location"
    },

    "AUDIOPLAYER" : {
        "WARNING_TEXT": "The runtime simulated saving the audio file to {file}. If you need to access this file in your application, please copy a file to the saved location"
    },

    "API_APPLICATION": {
        "NO_APPLICATIONS_MESSAGE": "No applications available for your platform"
    },

    "NOTIFICATIONS":  {
        "MESSAGE_CONTAINER_CLASS": "notification-message-div",
        "MAIN_CONTAINER_CLASS": "panel-notification",
        "CLOSE_BUTTON_CLASS": "panel-notification-closebtn",
        "MESSAGE_TEXT_CONTAINER_CLASS": "panel-notification-text",
        "CSS_PREFIX": "panel-notification-",
        "STATE_TYPES": {
            "OPEN": 1,
            "CLOSE": 2
        }
    },

    "CSS_PREFIX":  {
        "IRRELEVANT" : "irrelevant"
    },

    "STORAGE":  {
        "PAIR_DELIMETER" : ",",
        "KEY_VALUE_DELIMETER" : "|"
    },

    "REGEX":  {
        "GEO" : /^geo-/,
        "URL": /^((https?|ftp|gopher|telnet|file|notes|ms-help):((\/\/)|(\\\\))+[\w\d:#@%\/;$()~_?\+-=\\\.&]*)$/,
        //"Email": /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/
        "EMAIL": /^([^@\s]+)@((?:[\-a-z0-9]+\.)+[a-z]{2,})$/,
        "WC3_DTF": /^((\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)|(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)|(\d{4})-(\d\d)-(\d\d)|(\d{4})-(\d\d)|(\d\d\d\d))$/,
        "LOCAL_URI": /^https?:\/\/(127\.0\.0\.1|localhost)|^file:\/\//,
        "EXTERNAL_URI": /(?:(?:[a-zA-Z0-9\/;\?&=:\-_\$\+!\*'\(\|\\~\[\]#%\.](?!www))+(?:\.[Cc]om|\.[Ee]du|\.[gG]ov|\.[Ii]nt|\.[Mm]il|\.[Nn]et|\.[Oo]rg|\.[Bb]iz|\.[Ii]nfo|\.[Nn]ame|\.[Pp]ro|\.[Aa]ero|\.[cC]oop|\.[mM]useum|\.[Cc]at|\.[Jj]obs|\.[Tt]ravel|\.[Aa]rpa|\.[Mm]obi|\.[Aa]c|\.[Aa]d|\.[aA]e|\.[aA]f|\.[aA]g|\.[aA]i|\.[aA]l|\.[aA]m|\.[aA]n|\.[aA]o|\.[aA]q|\.[aA]r|\.[aA]s|\.[aA]t|\.[aA]u|\.[aA]w|\.[aA]z|\.[aA]x|\.[bB]a|\.[bB]b|\.[bB]d|\.[bB]e|\.[bB]f|\.[bB]g|\.[bB]h|\.[bB]i|\.[bB]j|\.[bB]m|\.[bB]n|\.[bB]o|\.[bB]r|\.[bB]s|\.[bB]t|\.[bB]v|\.[bB]w|\.[bB]y|\.[bB]z|\.[cC]a|\.[cC]c|\.[cC]d|\.[cC]f|\.[cC]g|\.[cC]h|\.[cC]i|\.[cC]k|\.[cC]l|\.[cC]m|\.[cC]n|\.[cC]o|\.[cC]r|\.[cC]s|\.[cC]u|\.[cC]v|\.[cC]x|\.[cC]y|\.[cC]z|\.[dD]e|\.[dD]j|\.[dD]k|\.[dD]m|\.[dD]o|\.[dD]z|\.[eE]c|\.[eE]e|\.[eE]g|\.[eE]h|\.[eE]r|\.[eE]s|\.[eE]t|\.[eE]u|\.[fF]i|\.[fF]j|\.[fF]k|\.[fF]m|\.[fF]o|\.[fF]r|\.[gG]a|\.[gG]b|\.[gG]d|\.[gG]e|\.[gG]f|\.[gG]g|\.[gG]h|\.[gG]i|\.[gG]l|\.[gG]m|\.[gG]n|\.[gG]p|\.[gG]q|\.[gG]r|\.[gG]s|\.[gG]t|\.[gG]u|\.[gG]w|\.[gG]y|\.[hH]k|\.[hH]m|\.[hH]n|\.[hH]r|\.[hH]t^[ml]?|\.[hH]u|\.[iI]d|\.[iI]e|\.[iI]l|\.[iI]m|\.[iI]n|\.[iI]o|\.[iI]q|\.[iI]r|\.[iI]s|\.[iI]t|\.[jJ]e|\.[jJ]m|\.[jJ]o|\.[jJ]p|\.[kK]e|\.[kK]g|\.[kK]h|\.[kK]i|\.[kK]m|\.[kK]n|\.[kK]p|\.[kK]r|\.[kK]w|\.[kK]y|\.[kK]z|\.[lL]a|\.[lL]b|\.[lL]c|\.[lL]i|\.[lL]k|\.[lL]r|\.[lL]s|\.[lL]t|\.[lL]u|\.[lL]v|\.[lL]y|\.[mM]a|\.[mM]c|\.[mM]d|\.[mM]g|\.[mM]h|\.[mM]k|\.[mM]l|\.[mM]m|\.[mM]n|\.[mM]o|\.[mM]p|\.[mM]q|\.[mM]r|\.[mM]s|\.[mM]t|\.[mM]u|\.[mM]v|\.[mM]w|\.[mM]x|\.[mM]y|\.[mM]z|\.[nN]a|\.[nN]c|\.[nN]e|\.[nN]f|\.[nN]g|\.[nN]i|\.[nN]l|\.[nN]o|\.[nN]p|\.[nN]r|\.[nN]u|\.[nN]z|\.[oO]m|\.[pP]a|\.[pP]e|\.[pP]f|\.[pP]g|\.[pP]h|\.[pP]k|\.[pP]l|\.[pP]m|\.[pP]n|\.[pP]r|\.[pP]s|\.[pP]t|\.[pP]w|\.[pP]y|\.[qP]a|\.[rR]e|\.[rR]o|\.[rR]u|\.[rR]w|\.[sS]a|\.[sS]b|\.[sS]c|\.[sS]d|\.[sS]e|\.[sS]g|\.[sS]h|\.[Ss]i|\.[sS]j|\.[sS]k|\.[sS]l|\.[sS]m|\.[sS]n|\.[sS]o|\.[sS]r|\.[sS]t|\.[sS]v[^c]|\.[sS]y|\.[sS]z|\.[tT]c|\.[tT]d|\.[tT]f|\.[tT]g|\.[tT]h|\.[tT]j|\.[tT]k|\.[tT]l|\.[tT]m|\.[tT]n|\.[tT]o|\.[tT]p|\.[tT]r|\.[tT]t|\.[tT]v|\.[tT]w|\.[tT]z|\.[uU]a|\.[uU]g|\.[uU]k|\.[uU]m|\.[uU]s|\.[uU]y|\.[uU]z|\.[vV]a|\.[vV]c|\.[vV]e|\.[vV]g|\.[vV]i|\.[vV]n|\.[vV]u|\.[wW]f|\.[wW]s|\.[yY]e|\.[yY]t|\.[yY]u|\.[zZ]a|\.[zZ]m|\.[zZ]w))/
    },

    "CONFIG": {
        "SUCCESS_CSS": {
            "true": "ui-text-pass",
            "false": "ui-text-fail",
            "missing": "ui-text-missing"
        }
    },

    "SETTINGS": {
        "TOOLTIPS_TOGGLE_DIV": "#settings-toggletooltips",
        "TOOLTIPS_KEY": "tool-tips-key"
    },

    "PANEL": {
        "PANEL_CONFIG_ENABLE": "panel-config-enable"
    },

    "UI": {
        "JQUERY_UI_BUTTON_CLASSES": "ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only",
        "JQUERY_UI_INPUT_CLASSES": "ui-state-default ui-corner-all",
        "PANEL_TABLE_CLASS": "panel-table",
        "RIGHT_RANGE_LABEL_CLASS": "range-label",
        "LEFT_RANGE_LABEL_CLASS": "range-label-left",
        "TEXT_LABEL_CLASS": "ui-text-label",
        "SCREEN_PPI": 96
    },

    "MULTIMEDIA": {
        "AUDIO_STATES": {
            "OPENED": "opened",
            "STOPPED": "stopped",
            "PAUSED": "paused",
            "PLAYING": "playing",
            "COMPLETED": "completed"
        }
    },

    "LANG": {
        "ISO6392_LIST": ["abk", "ace", "ach", "ada", "ady", "aar", "afh", "afr", "afa", "ain", "aka", "akk", "alb/sqi", "gsw", "ale", "alg", "tut", "amh", "anp", "apa", "ara", "arg", "arp", "arw", "arm/hye", "rup", "art", "asm", "ast", "ath", "aus", "map", "ava", "ave", "awa", "aym", "aze", "ban", "bat", "bal", "bam", "bai", "bad", "bnt", "bas", "bak", "baq/eus", "btk", "bej", "bel", "bem", "ben", "ber", "bho", "bih", "bik", "byn", "bin", "bis", "zbl", "nob", "bos", "bra", "bre", "bug", "bul", "bua", "bur/mya", "cad", "spa", "cat", "cau", "ceb", "cel", "cai", "khm", "chg", "cmc", "cha", "che", "chr", "nya", "chy", "chb", "chi/zho", "chn", "chp", "cho", "zha", "chu", "chk", "chv", "nwc", "syc", "rar", "cop", "cor", "cos", "cre", "mus", "crp", "cpe", "cpf", "cpp", "crh", "hrv", "cus", "cze/ces", "dak", "dan", "dar", "del", "div", "zza", "din", "doi", "dgr", "dra", "dua", "dut/nld", "dum", "dyu", "dzo", "frs", "efi", "egy", "eka", "elx", "eng", "enm", "ang", "myv", "epo", "est", "ewe", "ewo", "fan", "fat", "fao", "fij", "fil", "fin", "fiu", "fon", "fre/fra", "frm", "fro", "fur", "ful", "gaa", "gla", "car", "glg", "lug", "gay", "gba", "gez", "geo/kat", "ger/deu", "nds", "gmh", "goh", "gem", "kik", "gil", "gon", "gor", "got", "grb", "grc", "gre/ell", "kal", "grn", "guj", "gwi", "hai", "hat", "hau", "haw", "heb", "her", "hil", "him", "hin", "hmo", "hit", "hmn", "hun", "hup", "iba", "ice/isl", "ido", "ibo", "ijo", "ilo", "arc", "smn", "inc", "ine", "ind", "inh", "ina", "ile", "iku", "ipk", "ira", "gle", "mga", "sga", "iro", "ita", "jpn", "jav", "kac", "jrb", "jpr", "kbd", "kab", "xal", "kam", "kan", "kau", "pam", "kaa", "krc", "krl", "kar", "kas", "csb", "kaw", "kaz", "kha", "khi", "kho", "kmb", "kin", "kir", "tlh", "kom", "kon", "kok", "kor", "kos", "kpe", "kro", "kua", "kum", "kur", "kru", "kut", "lad", "lah", "lam", "day", "lao", "lat", "lav", "ltz", "lez", "lim", "lin", "lit", "jbo", "dsb", "loz", "lub", "lua", "lui", "smj", "lun", "luo", "lus", "mac/mkd", "mad", "mag", "mai", "mak", "mlg", "may/msa", "mal", "mlt", "mnc", "mdr", "man", "mni", "mno", "glv", "mao/mri", "arn", "mar", "chm", "mah", "mwr", "mas", "myn", "men", "mic", "min", "mwl", "moh", "mdf", "rum/ron", "mkh", "lol", "mon", "mos", "mul", "mun", "nqo", "nah", "nau", "nav", "nde", "nbl", "ndo", "nap", "new", "nep", "nia", "nic", "ssa", "niu", "zxx", "nog", "non", "nai", "frr", "sme", "nso", "nor", "nno", "nub", "iii", "nym", "nyn", "nyo", "nzi", "oci", "pro", "oji", "ori", "orm", "osa", "oss", "oto", "pal", "pau", "pli", "pag", "pan", "pap", "paa", "pus", "per/fas", "peo", "phi", "phn", "pon", "pol", "por", "pra", "que", "raj", "rap", "qaa-qtz", "roa", "roh", "rom", "run", "rus", "sal", "sam", "smi", "smo", "sad", "sag", "san", "sat", "srd", "sas", "sco", "sel", "sem", "srp", "srr", "shn", "sna", "scn", "sid", "sgn", "bla", "snd", "sin", "sit", "sio", "sms", "den", "sla", "slo/slk", "slv", "sog", "som", "son", "snk", "wen", "sot", "sai", "alt", "sma", "srn", "suk", "sux", "sun", "sus", "swa", "ssw", "swe", "syr", "tgl", "tah", "tai", "tgk", "tmh", "tam", "tat", "tel", "ter", "tet", "tha", "tib/bod", "tig", "tir", "tem", "tiv", "tli", "tpi", "tkl", "tog", "ton", "tsi", "tso", "tsn", "tum", "tup", "tur", "ota", "tuk", "tvl", "tyv", "twi", "udm", "uga", "uig", "ukr", "umb", "mis", "und", "hsb", "urd", "uzb", "vai", "ven", "vie", "vol", "vot", "wak", "wln", "war", "was", "wel/cym", "fry", "wal", "wol", "xho", "sah", "yao", "yap", "yid", "yor", "ypk", "znd", "zap", "zen", "zul", "zun"]
    },

    "XHR": {
        "PROXY_DISABLED_BUTTON": "settings-xhrproxy-disabled"
    },

    "PLATFORMS": {
        "WAC": {
            "APPLICATIONS": [
                "ALARM",
                "BROWSER",
                "CALCULATOR",
                "CALENDAR",
                "CAMERA",
                "CONTACTS",
                "FILES",
                "GAMES",
                "MAIL",
                "MEDIAPLAYER",
                "MESSAGING",
                "PHONECALL",
                "PICTURES",
                "PROG_MANAGER",
                "SETTINGS",
                "TASKS",
                "WIDGET_MANAGER"
            ],
            "DEVICE": {
                "WIDGET_ENGINE_NAME": "Generic",
                "WIDGET_ENGINE_PROVIDER": "tinyHippos",
                "WIDGET_ENGINE_VERSION": "x.x"
            }
        }
    },

    "POWER_RESOURCE": {
        "SCREEN": {
            "NAME": "SCREEN",
            "STATE": {
                "SCREEN_OFF": {
                    "NAME": "SCREEN_OFF",
                    "MIN": 0,
                    "MAX": 0,
                    "VALUE": 0
                },
                "SCREEN_DIM": {
                    "NAME": "SCREEN_DIM",
                    "MIN": 0,
                    "MAX": 0.2,
                    "VALUE": 0.15
                },
                "SCREEN_NORMAL": {
                    "NAME": "SCREEN_NORMAL",
                    "MIN": 0.2,
                    "MAX": 1,
                    "VALUE": 0.8
                },
                "SCREEN_BRIGHT": {
                    "NAME": "SCREEN_BRIGHT",
                    "MIN": 1,
                    "MAX": 1,
                    "VALUE": 1
                }
            }
        },
        "CPU": {
            "NAME": "CPU",
            "STATE": {
                "CPU_AWAKE": {
                    "NAME": "CPU_AWAKE",
                    "DEFAULT_VALUE" : 0.5
                }
            }
        }
    }
};
});
define.unordered = true;
define('ripple/db', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var _self,
    _db,
    utils = require('ripple/utils'),
    constants = require('ripple/constants'),
    event = require('ripple/event'),
    _cache = {};

function _validateAndSetPrefix(prefix) {
    if (prefix) {
        utils.validateArgumentType(prefix, "string");
    }

    return prefix || constants.COMMON.PREFIX;
}

function _createKey(key, prefix) {
    return _validateAndSetPrefix(prefix) + key;
}

function _createItem(key, value, prefix) {
    return {
        id: _createKey(key, prefix),
        key: key,
        value: value,
        prefix: _validateAndSetPrefix(prefix)
    };
}

function _save(key, value, prefix, callback) {
    var item = _createItem(key, value, prefix);
    _cache[item.id] = item;

    _db.transaction(function (tx) {
        tx.executeSql('REPLACE INTO persistence (id, key, value, prefix) VALUES (?, ?, ?, ?)', [item.id, item.key, item.value, item.prefix], function () {
            return callback && callback();
        });
    });
}

function _retrieve(key, prefix) {
    var item = _cache[_createKey(key, prefix)];
    return item ? item.value : undefined;
}

function _retrieveAll(prefix, callback) {
    var result = {};

    if (prefix) {
        utils.forEach(_cache, function (value, key) {
            if (value.prefix === prefix) {
                result[value.key] = value.value;
            }
        });
    }

    callback.apply(null, [result]);
}

function _remove(key, prefix, callback) {
    delete _cache[_createKey(key, prefix)];

    _db.transaction(function (tx) {
        tx.executeSql('DELETE FROM persistence WHERE key = ? AND prefix = ?', [key, _validateAndSetPrefix(prefix)], function () {
            return callback && callback();
        });
    });
}

function _removeAll(prefix, callback) {
    utils.forEach(_cache, function (value, key) {
        if (!prefix || key.indexOf(prefix) === 0) {
            delete _cache[key];
        }
    });

    _db.transaction(function (tx) {
        if (prefix) {
            tx.executeSql('DELETE FROM persistence WHERE prefix = ?', [prefix], function () {
                return callback && callback();
            });
        } else {
            tx.executeSql('DELETE FROM persistence', [], function () {
                return callback && callback();
            });
        }
    });
}

_self = {
    save: function (key, value, prefix, callback) {
        _save(key, value, prefix, callback);
        event.trigger("StorageUpdatedEvent");
    },

    saveObject: function (key, obj, prefix, callback) {
        _save(key, JSON.stringify(obj), prefix, callback);
        event.trigger("StorageUpdatedEvent");
    },

    retrieve: function (key, prefix) {
        return _retrieve(key, prefix);
    },

    retrieveObject: function (key, prefix) {
        var retrievedValue = _retrieve(key, prefix);
        return retrievedValue ? JSON.parse(retrievedValue) : retrievedValue;
    },

    retrieveAll: function (prefix, callback) {
        return _retrieveAll(prefix, callback);
    },

    remove: function (key, prefix, callback) {
        event.trigger("StorageUpdatedEvent");
        _remove(key, prefix, callback);
    },

    removeAll: function (prefix, callback) {
        _removeAll(prefix, callback);
        event.trigger("StorageUpdatedEvent");
    },

    initialize: function (previous, baton) {
        baton.take();

        _db = openDatabase('tinyHippos', '1.0', 'tiny Hippos persistence', 2 * 1024 * 1024);
        _db.transaction(function (tx) {
            tx.executeSql('CREATE TABLE IF NOT EXISTS persistence (id unique, key, value, prefix)');

            tx.executeSql('SELECT id, key, value, prefix FROM persistence', [], function (tx, results) {
                var len = results.rows.length, i, item;

                for (i = 0; i < len; i++) {
                    item = results.rows.item(i);
                    _cache[item.id] = item;
                }

                baton.pass();
            });
        });
    }
};

module.exports = _self;
});
define.unordered = true;
define('ripple/exception', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var _console = require('ripple/console');

function _getStack(depth) {
    var caller,
        stack = "",
        count = 0;

    try {
        caller = arguments.callee.caller.arguments.callee.caller;

        while (count <= depth && caller) {
            stack += "function: " + caller.toString().match(/function\s?(.*)\{/)[1] + "\n";
            caller = caller.arguments.callee.caller;
            count++;
        }
    } catch (e) {
        stack = "failed to determine stack trace (" + (e.name || e.type) + " :: " + e.message + ")";
    }

    return stack;
}

module.exports = {

    types: {
        Application: "Application",
        ArgumentLength: "ArgumentLength",
        ArgumentType: "ArgumentType",
        Argument: "Argument",
        NotificationType: "NotificationType",
        NotificationStateType: "NotificationStateType",
        DomObjectNotFound: "DomObjectNotFound",
        LayoutType: "LayoutType",
        OrientationType: "OrientationType",
        DeviceNotFound: "DeviceNotFound",
        tinyHipposMaskedException: "tinyHipposMaskedException",
        Geo: "Geo",
        Accelerometer: "Accelerometer",
        MethodNotImplemented: "MethodNotImplemented",
        InvalidState: "InvalidState",
        ApplicationState: "ApplicationState"
    },

    handle: function handle(exception, reThrow) {
        reThrow = reThrow || false;

        var eMsg = exception.message || "exception caught!",
        msg = eMsg + "\n\n" + (exception.stack || "*no stack provided*") + "\n\n";

        _console.error(msg);

        if (reThrow) {
            throw exception;
        }
    },

    raise: function raise(exceptionType, message, customExceptionObject) {
        var obj = customExceptionObject || {
                type: "",
                message: "",

                toString: function () {
                    var result = this.name + ': "' + this.message + '"';

                    if (this.stack) {
                        result += "\n" + this.stack;
                    }
                    return result;
                }
            };

        message = message || "";

        obj.name = exceptionType;
        obj.type = exceptionType;
        // TODO: include the exception objects original message if exists
        obj.message = message;
        obj.stack = _getStack(5);

        throw obj;
    },

    throwMaskedException: function throwMaskedException(exceptionType, message, customExceptionObject) {
        try {
            this.raise.apply(this, arguments);
        } catch (e) {
            this.handle(e);
        }
        this.raise(this.types.tinyHipposMaskedException, "tinyhippos terminated your script due to exception");
    }

};
});
define.unordered = true;
define('ripple/event', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var utils = require('ripple/utils'),
    exception = require('ripple/exception'),
    _listeners = {};

function _on(eventType, listener, scope, once) {
    if (!eventType) {
        throw "eventType must be truthy";
    }
    _listeners[eventType] = _listeners[eventType] || [];
    _listeners[eventType].push({
        func: listener,
        scope: scope,
        once: !!once
    });
}

function _deleteEventHandler(eventType, listenerFunc, scope) {
    var i, listeners;

    if (!eventType) {
        throw "eventType must be truthy";
    }

    listeners = _listeners[eventType];

    // only delete once
    for (i = 0; i < listeners.length; i++) {
        if (listeners[i].func === listenerFunc) {
            listeners.splice(i, 1);
            break;
        }
    }
}

function _trigger(listener, args, sync) {
    try {
        if (sync) {
            listener.func.apply(listener.scope, args);
        }
        else {
            setTimeout(function () {
                listener.func.apply(listener.scope, args);
            }, 1);
        }
    }
    catch (e) {
        exception.handle(e);
    }
}

module.exports = {
    on: function (eventType, listener, scope) {
        _on(eventType, listener, scope, false);
    },

    once: function (eventType, listener, scope) {
        _on(eventType, listener, scope, true);
    },

    trigger: function (eventType, args, sync) {
        args = args || [];
        sync = sync || false;

        var listeners = _listeners[eventType];

        if (listeners) {
            listeners.forEach(function (listener) {
                _trigger(listener, args, sync);
            });

            _listeners[eventType] = listeners.filter(function (listener) {
                return !listener.once;
            });
        }
    },

    eventHasSubscriber: function (eventType) {
        return !!_listeners[eventType];
    },

    getEventSubscribers: function (eventType) {
        return utils.copy(_listeners[eventType]) || [];
    },

    clear: function (eventType) {
        if (eventType) {
            delete _listeners[eventType];
        }
    },

    deleteEventHandler: function (eventType, listener, scope) {
        _deleteEventHandler(eventType, listener, scope);
    }
};
});
define.unordered = true;
define('ripple/utils', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var self,
    exception = require('ripple/exception'),
    constants = require('ripple/constants'),
    _HtmlElements = ['header', 'footer', 'section', 'aside', 'nav', 'article'];

self = module.exports = {
    validateNumberOfArguments: function (lowerBound, upperBound, numberOfArguments, customExceptionType, customExceptionMessage, customExceptionObject) {

        customExceptionMessage = customExceptionMessage || "";

        if (arguments.length < 3 || arguments.length > 6) {
            exception.raise(exception.types.Argument, "Wrong number of arguments when calling: validateNumberOfArguments()");
        }

        if (isNaN(lowerBound) && isNaN(upperBound) && isNaN(numberOfArguments)) {
            exception.raise(exception.types.ArgumentType, "(validateNumberOfArguments) Arguments are not numbers");
        }

        lowerBound = parseInt(lowerBound, 10);
        upperBound = parseInt(upperBound, 10);
        numberOfArguments = parseInt(numberOfArguments, 10);

        if (numberOfArguments < lowerBound || numberOfArguments > upperBound) {
            exception.raise((customExceptionType || exception.types.ArgumentLength), (customExceptionMessage + "\n\nWrong number of arguments"), customExceptionObject);
        }

    },

    validateArgumentType: function (arg, argType, customExceptionType, customExceptionMessage, customExceptionObject) {
        var invalidArg = false,
            msg;

        switch (argType) {
        case "array":
            if (!arg instanceof Array) {
                invalidArg = true;
            }
            break;
        case "date":
            if (!arg instanceof Date) {
                invalidArg = true;
            }
            break;
        case "integer":
            if (typeof arg === "number") {
                if (arg !== Math.floor(arg)) {
                    invalidArg = true;
                }
            }
            else {
                invalidArg = true;
            }
            break;
        default:
            if (typeof arg !== argType) {
                invalidArg = true;
            }
            break;
        }

        if (invalidArg) {
            msg = customExceptionMessage +  ("\n\nInvalid Argument type. argument: " + arg + " ==> was expected to be of type: " + argType);
            exception.raise((customExceptionType || exception.types.ArgumentType), msg, customExceptionObject);
        }
    },

    validateMultipleArgumentTypes: function (argArray, argTypeArray, customExceptionType, customExceptionMessage, customExceptionObject) {
        for (var i = 0; i < argArray.length; i++) {
            this.validateArgumentType(argArray[i], argTypeArray[i], customExceptionType, customExceptionMessage, customExceptionObject);
        }
    },

    createElement: function (elementType, attributes) {
        var d = document.createElement(elementType);

        if (attributes) {
            this.forEach(attributes, function (attributeValue, attributeName) {

                switch (attributeName.toLowerCase()) {

                case "innerhtml":
                    d.innerHTML = attributeValue;
                    break;

                case "innertext":
                    d.innerText = attributeValue;
                    break;

                default:
                    d.setAttribute(attributeName, attributeValue);
                }

            });
        }

        return d;
    },


    loadHTMLElements: function () {
        for (var i = 0; i < _HtmlElements.length; i += 1) {
            document.createElement(_HtmlElements[i]);
        }
    },

    getAllStylesheetRules: function getAllStylesheetRules(title) {
        this.validateNumberOfArguments(1, 1, arguments.length);

        var i, x, sheet, rules, styles_array = [];

        // get style sheet according to title
        for (i = 0; i < document.styleSheets.length; i += 1) {

            sheet = document.styleSheets[i];
            rules = sheet.cssRules;

            if (rules) {
                for (x = 0; x < rules.length; x += 1) {
                    if (rules[x].selectorText && rules[x].selectorText === (title.toString())) {
                        styles_array.push(rules[x]);
                    }
                }
            }
        }

        return (styles_array);
    },

    location: function () {
        return window.location;
    },

    queryString: function () {
        // trim the leading ? and split each name=value
        var args = this.location().search.replace(/^\?/, '').split('&');

        return args.reduce(function (obj, value) {
            if (value) {
                value = value.toLowerCase().split("=");
                obj[value[0]] = value[1];
            }
            return obj;
        }, {});
    },

    extensionUrl: function () {
        return document.getElementById("extension-url").innerText;
    },

    appLocation: function () {
        if (require('ripple/ui').registered("omnibar")) {
            /* rootURL can only get url saved from 'FrameHistoryChange' event
               it causes trouble when navigating directory through online 
               version as index.html is automatically loaded.
               Need a way to get more updated URL */

            var path = require('ripple/ui/plugins/omnibar').rootURL(),
                parts;

            if ((parts = path.match(/^((http[s]?|ftp|file):\/\/)(.+\/)?([^\/].+)$/i)) !== null && parts.length === 5) {
                // this is a path already.
                if (path.search(/\/$/, "") !== -1) {
                    return path;
                }
                if (parts[4] === "about:blank") {
                    path = "";
                }
                else if (parts[3]) {
                    path = parts[1] + parts[3];
                    if (parts[4].indexOf(".") === -1) {
                        path += parts[4] + "/";
                    }
                }
                else {
                    path = parts[1] + parts[4] + "/";
                }
            }
            else {
                path = "";
            }
            return path;
        }
        return self.rippleLocation();
    },

    rippleLocation: function () {
        var loc = self.location(),
            parts = loc.pathname.replace(/\/$/, "").split("/"),
            base = "",
            port = loc.port ? ":" + loc.port : "";

        if (parts[parts.length - 1].indexOf(".") !== -1) {
            parts = parts.splice(0, parts.length - 1);
        }
        base = parts.join("/");

        return loc.protocol + "//" + loc.hostname + port + base + "/";
    },

    arrayContains: function (array, obj) {
        var i = array.length;
        while (i--) {
            if (array[i] === obj) {
                return true;
            }
        }
        return false;
    },

    some: function (obj, predicate, scope) {
        if (obj instanceof Array) {
            return obj.some(predicate, scope);
        }
        else {
            var values = self.map(obj, predicate, scope);

            return self.reduce(values, function (some, value) {
                return value ? value : some;
            }, false);
        }
    },

    count: function (obj) {
        return self.sum(obj, function (total) {
            return 1;
        });
    },

    sum: function (obj, selector, scope) {
        var values = self.map(obj, selector, scope);
        return self.reduce(values, function (total, value) {
            return total + value;
        });
    },

    max: function (obj, selector, scope) {
        var values = self.map(obj, selector, scope);
        return self.reduce(values, function (max, value) {
            return max < value ? value : max;
        }, Number.MIN_VALUE);
    },

    min: function (obj, selector, scope) {
        var values = self.map(obj, selector, scope);
        return self.reduce(values, function (min, value) {
            return min > value ? value : min;
        }, Number.MAX_VALUE);
    },

    forEach: function (obj, action, scope) {
        if (obj instanceof Array) {
            return obj.forEach(action, scope);
        }
        else {
            self.map(obj, action, scope);
        }
    },

    filter: function (obj, predicate, scope) {
        if (obj instanceof Array) {
            return obj.filter(predicate, scope);
        }
        else {
            var result = [];
            self.forEach(obj, function (value, index) {
                if (predicate.apply(scope, [value, index])) {
                    result.push(value);
                }

            }, scope);

            return result;
        }
    },

    reduce: function (obj, func, init, scope) {
        var i,
            initial = init === undefined ? 0 : init,
            result = initial;


        if (obj instanceof Array) {
            return obj.reduce(func, initial);
        }
        else if (obj instanceof NamedNodeMap) {
            for (i = 0; i < obj.length; i++) {
                result = func.apply(scope, [result, obj[i], i]);
            }
        }
        else {
            for (i in obj) {
                if (obj.hasOwnProperty(i)) {
                    result = func.apply(scope, [result, obj[i], i]);
                }
            }
        }

        return result;

    },

    map: function (obj, func, scope) {
        var i,
            returnVal = null,
            result = [];

        if (obj instanceof Array) {
            return obj.map(func, scope);
        }
        else if (obj instanceof NamedNodeMap) {
            for (i = 0; i < obj.length; i++) {
                returnVal = func.apply(scope, [obj[i], i]);
                result.push(returnVal);
            }
        }
        else {
            for (i in obj) {
                if (obj.hasOwnProperty(i)) {
                    returnVal = func.apply(scope, [obj[i], i]);
                    result.push(returnVal);
                }
            }
        }

        return result;
    },

    regexSanitize: function (regexString) {
        return regexString.replace("^", "\\^")
                    .replace("$", "\\$")
                    .replace("(", "\\(")
                    .replace(")", "\\)")
                    .replace("<", "\\<")
                    .replace("[", "\\[")
                    .replace("{", "\\{")
                    .replace(/\\/, "\\\\")
                    .replace("|", "\\|")
                    .replace(">", "\\>")
                    .replace(".", "\\.")
                    .replace("*", "\\*")
                    .replace("+", "\\+")
                    .replace("?", "\\?");
    },

    bindAutoSaveEvent: function (node, saveCallback) {
        var oldSetTimeoutId,
            jNode = jQuery(node);

        jNode.bind("keyup", function (event) {
            if (event.keyCode !== 9) {
                clearTimeout(oldSetTimeoutId);
                oldSetTimeoutId = window.setTimeout(function () {
                    saveCallback();
                }, 500);
            }
        });
    },

    find: function (comparison, collection, startInx, endInx, callback) {
        var results = [],
            compare = function (s, pattern) {

                if (typeof(s) !== "string" || pattern === null) {
                    return s === pattern;
                }

                var regex = pattern.replace(/\./g, "\\.")
                                   .replace(/\^/g, "\\^")
                                   .replace(/\*/g, ".*")
                                   .replace(/\\\.\*/g, "\\*");

                regex = "^".concat(regex, "$");

                return !!s.match(new RegExp(regex, "i"));
            };

        self.forEach(collection, function (c) {
            var match,
                fail = false;

            self.forEach(comparison, function (value, key) {
                if (!fail && value !== undefined) {

                    if (compare(c[key], value)) {
                        match = c;
                    }
                    else {
                        fail = true;
                        match = null;
                    }
                }
            });

            if (match) {
                results.push(match);
            }
        });

        if (callback) {
            if (startInx === undefined) {
                startInx = 0;
            }
            if (endInx === undefined) {
                endInx = results.length;
            }
            if (startInx === endInx) {
                endInx = startInx + 1;
            }

            callback.apply(null, [results.slice(startInx, endInx)]);
        }
    },

    mixin: function (mixin, to) {
        for (var prop in mixin) {
            if (Object.hasOwnProperty.call(mixin, prop)) {
                to[prop] = mixin[prop];
            }
        }
        return to;
    },

    copy: function (obj) {
        var i,
            newObj = jQuery.isArray(obj) ? [] : {};

        if (typeof obj === 'number' ||
            typeof obj === 'string' ||
            typeof obj === 'boolean' ||
            obj === null ||
            obj === undefined) {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj);
        }

        if (obj instanceof RegExp) {
            return new RegExp(obj);
        }

        for (i in obj) {
            if (obj.hasOwnProperty(i)) {
                if (obj[i] && typeof obj[i] === "object") {
                    if (obj[i] instanceof Date) {
                        newObj[i] = obj[i];
                    }
                    else {
                        newObj[i] = self.copy(obj[i]);
                    }
                }
                else {
                    newObj[i] = obj[i];
                }
            }
        }

        return newObj;
    },

    navHelper: function () {
        return {
            getHeading: function (lat1, lon1, lat2, lon2) {
                var dLon = this.rad(lon2 - lon1),
                    llat1 = this.rad(lat1),
                    llat2 = this.rad(lat2),
                    y = Math.sin(dLon) * Math.cos(llat2),
                    x = Math.cos(llat1) * Math.sin(llat2) - Math.sin(llat1) * Math.cos(llat2) * Math.cos(dLon);
                return (this.deg(Math.atan2(y, x)) + 360) % 360;
            },

            getDistance: function (lat1, lon1, lat2, lon2) {
                var dLat = this.rad(lat2 - lat1),
                    dLon = this.rad(lon2 - lon1),
                    a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.rad(lat1)) * Math.cos(this.rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
                    c = 2 * Math.asin(Math.sqrt(a)),
                    d = 6378100 * c;
                return d;
            },

            simulateTravel: function (lat, lon, hdg, dist) {
                var lat1 = this.rad(lat),
                    lon1 = this.rad(lon),
                    brng = this.rad(hdg),
                    angularDistance = dist / 6378100,
                    lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng)),
                    lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
                lon2 = (lon2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI; // Normalise to -180..+180

                return {
                    latitude: this.deg(lat2),
                    longitude: this.deg(lon2)
                };
            },

            deg: function (num) {
                return num * 180 / Math.PI;
            },

            rad: function (num) {
                return num * Math.PI / 180;
            }
        };
    }
};
});
define.unordered = true;
define('ripple/xwalkDeviceSettings', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* DeviceSettings
 *  A per object store for a platform's settings.
 *  For example, RadioInfo object in WAC has isRadioEnabled that can be true/false
 *  setting => {key: {key1: "test"}}
 */
var _PERSISTENCE_KEY = "devicesettings",
    db = require('ripple/db'),
    _defaults = require('ripple/platform/tizen/2.0/spec'),
    _currentDeviceSettings = {},
    _self;

function _default(key) {
    var keys = key.split(".");
    if (keys.length === 1)
        return _defaults[key];
    return keys.length === 2 &&
           _defaults[keys[0]] &&
           _defaults[keys[0]][keys[1]] &&
           _defaults[keys[0]][keys[1]].control ?
           _defaults[keys[0]][keys[1]].control.value : undefined;
}

_self = {
    initialize: function () {
        // TODO: remove deprecated DeviceSettings from persisted ones.
        _currentDeviceSettings = db.retrieveObject(_PERSISTENCE_KEY) || {};
    },
    register: function (key, obj) {
        _currentDeviceSettings[key] = obj;
    },

    persist: function (key, obj) {
        if (key) {
            _currentDeviceSettings[key] = obj;
        }
        db.saveObject(_PERSISTENCE_KEY, _currentDeviceSettings);
    },

    retrieve: function (key) {
        return _currentDeviceSettings.hasOwnProperty(key) ?
               _currentDeviceSettings[key] : _default(key);
    },

    retrieveAsInt: function (key) {
        return parseInt(_self.retrieve(key), 10);
    },

    retrieveAsBoolean: function (key) {
        return !!_self.retrieve(key);
    }
};

module.exports = _self;
});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec', function (require, exports, module) {
/*
 *  Copyright 2012 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports = {

    id: "tizen",
    version: "2.2",
    name: "TIZEN",

    persistencePrefix: "tizen1-",

    config: require('ripple/platform/tizen/2.0/spec/config'),
    ui: require('ripple/platform/tizen/2.0/spec/ui'),
    device: require('ripple/platform/tizen/2.0/spec/device'),
    sensor: require('ripple/platform/tizen/2.0/spec/sensor'),
    DeviceMotionEvent: require('ripple/platform/tizen/2.0/DeviceMotionEvent'),
    DeviceOrientationEvent: require('ripple/platform/tizen/2.0/DeviceOrientationEvent'),

    objects: {
        Coordinates: {
            path: "w3c/1.0/Coordinates"
        },
        Position: {
            path: "w3c/1.0/Position"
        },
        PositionError: {
            path: "w3c/1.0/PositionError"
        },
        SensorConnection: {
            path: "w3c/1.0/SensorConnection"
        },
        navigator: {
            path: "tizen/2.0/navigator",
            children: {
                geolocation: {
                    path: "wac/2.0/geolocation"
                },
                battery: {
                    path: "tizen/2.0/battery"
                }
            }
        },
        tizen: {
            feature: "http://tizen.org/privilege/tizen",
            children: {
                AlarmAbsolute: {
                    path: "tizen/2.0/AlarmAbsolute"
                },
                AlarmRelative: {
                    path: "tizen/2.0/AlarmRelative"
                },
                ApplicationControl: {
                    path: "tizen/2.0/ApplicationControl"
                },
                ApplicationControlData: {
                    path: "tizen/2.0/ApplicationControlData"
                },
                AttributeFilter: {
                    path: "tizen/2.0/AttributeFilter"
                },
                AttributeRangeFilter: {
                    path: "tizen/2.0/AttributeRangeFilter"
                },
                BookmarkFolder: {
                    path: "tizen/2.0/BookmarkFolder"
                },
                BookmarkItem: {
                    path: "tizen/2.0/BookmarkItem"
                },
                CalendarAlarm: {
                    path: "tizen/2.0/CalendarAlarm"
                },
                CalendarAttendee: {
                    path: "tizen/2.0/CalendarAttendee"
                },
                CalendarEvent: {
                    path: "tizen/2.0/CalendarEvent"
                },
                CalendarEventId: {
                    path: "tizen/2.0/CalendarEventId"
                },
                CalendarRecurrenceRule: {
                    path: "tizen/2.0/CalendarRecurrenceRule"
                },
                CalendarTask: {
                    path: "tizen/2.0/CalendarTask"
                },
                CompositeFilter: {
                    path: "tizen/2.0/CompositeFilter"
                },
                Contact: {
                    path: "tizen/2.0/ContactBase"
                },
                ContactAddress: {
                    path: "tizen/2.0/ContactAddress"
                },
                ContactAnniversary: {
                    path: "tizen/2.0/ContactAnniversary"
                },
                ContactEmailAddress: {
                    path: "tizen/2.0/ContactEmailAddress"
                },
                ContactGroup: {
                    path: "tizen/2.0/ContactGroup"
                },
                ContactName: {
                    path: "tizen/2.0/ContactName"
                },
                ContactOrganization: {
                    path: "tizen/2.0/ContactOrganization"
                },
                ContactPhoneNumber: {
                    path: "tizen/2.0/ContactPhoneNumber"
                },
                ContactRef: {
                    path: "tizen/2.0/ContactRef"
                },
                ContactWebSite: {
                    path: "tizen/2.0/ContactWebSite"
                },
                DownloadRequest: {
                    path: "tizen/2.0/DownloadRequest"
                },
                Message: {
                    path: "tizen/2.0/Message"
                },
                NDEFMessage: {
                    path: "tizen/2.0/NDEFMessage"
                },
                NDEFRecord: {
                    path: "tizen/2.0/NDEFRecord"
                },
                NDEFRecordMedia: {
                    path: "tizen/2.0/NDEFRecordMedia"
                },
                NDEFRecordText: {
                    path: "tizen/2.0/NDEFRecordText"
                },
                NDEFRecordURI: {
                    path: "tizen/2.0/NDEFRecordURI"
                },
                NotificationDetailInfo: {
                    path: "tizen/2.0/NotificationDetailInfo"
                },
                SimpleCoordinates: {
                    path: "tizen/2.0/SimpleCoordinates"
                },
                SortMode: {
                    path: "tizen/2.0/SortMode"
                },
                StatusNotification: {
                    path: "tizen/2.0/StatusNotification"
                },
                SyncInfo: {
                    path: "tizen/2.0/SyncInfo"
                },
                SyncServiceInfo: {
                    path: "tizen/2.0/SyncServiceInfo"
                },
                SyncProfileInfo: {
                    path: "tizen/2.0/SyncProfileInfo"
                },
                TZDate: {
                    path: "tizen/2.0/TZDate"
                },
                TimeDuration: {
                    path: "tizen/2.0/TimeDuration"
                },
                alarm: {
                    path: "tizen/2.0/alarm",
                    feature: "http://tizen.org/privilege/alarm",
                    handleSubfeatures: true
                },
                application: {
                    path: "tizen/2.0/application",
                    feature: "http://tizen.org/privilege/application.launch|http://tizen.org/privilege/appmanager.kill|http://tizen.org/privilege/appmanager.certificate",
                    handleSubfeatures: true
                },
                bluetooth: {
                    path: "tizen/2.0/bluetooth",
                    feature: "http://tizen.org/privilege/bluetoothmanager|http://tizen.org/privilege/bluetooth.admin|http://tizen.org/privilege/bluetooth.gap|http://tizen.org/privilege/bluetooth.spp",
                    handleSubfeatures: true
                },
                bookmark: {
                    path: "tizen/2.0/bookmark",
                    feature: "http://tizen.org/privilege/bookmark.read|http://tizen.org/privilege/bookmark.write",
                    handleSubfeatures: true
                },
                callhistory: {
                    path: "tizen/2.0/callHistory",
                    feature: "http://tizen.org/privilege/callhistory|http://tizen.org/privilege/callhistory.read|http://tizen.org/privilege/callhistory.write",
                    handleSubfeatures: true
                },
                calendar: {
                    path: "tizen/2.0/calendar",
                    feature: "http://tizen.org/privilege/calendar.read|http://tizen.org/privilege/calendar.write",
                    handleSubfeatures: true
                },
                contact: {
                    path: "tizen/2.0/contact",
                    feature: "http://tizen.org/privilege/contact.read|http://tizen.org/privilege/contact.write",
                    handleSubfeatures: true
                },
                content: {
                    path: "tizen/2.0/content",
                    feature: "http://tizen.org/privilege/content.read|http://tizen.org/privilege/content.write",
                    handleSubfeatures: true
                },
                datacontrol: {
                    path: "tizen/2.0/datacontrol",
                    feature: "http://tizen.org/privilege/datacontrol.consumer",
                    handleSubfeatures: true
                },
                datasync: {
                    path: "tizen/2.0/datasync",
                    feature: "http://tizen.org/privilege/datasync",
                    handleSubfeatures: true
                },
                download: {
                    path: "tizen/2.0/download",
                    feature: "http://tizen.org/privilege/download",
                    handleSubfeatures: true
                },
                filesystem: {
                    path: "tizen/2.0/filesystem",
                    feature: "http://tizen.org/privilege/filesystem.read|http://tizen.org/privilege/filesystem.write"
                },
                messaging: {
                    path: "tizen/2.0/messaging",
                    feature: "http://tizen.org/privilege/messaging.send|http://tizen.org/privilege/messaging.read|http://tizen.org/privilege/messaging.write",
                    handleSubfeatures: true
                },
                networkbearerselection: {
                    path: "tizen/2.0/networkbearerselection",
                    feature: "http://tizen.org/privilege/networkbearerselection",
                    handleSubfeatures: true
                },
                nfc: {
                    path: "tizen/2.0/nfc",
                    feature: "http://tizen.org/privilege/nfc.common|http://tizen.org/privilege/nfc.admin|http://tizen.org/privilege/nfc.tag|http://tizen.org/privilege/nfc.p2p",
                    handleSubfeatures: true
                },
                notification: {
                    path: "tizen/2.0/notification",
                    feature: "http://tizen.org/privilege/notification",
                    handleSubfeatures: true
                },
                package: {
                    path: "tizen/2.0/package",
                    feature: "http://tizen.org/privilege/packagemanager.install|http://tizen.org/privilege/package.info",
                    handleSubfeatures: true
                },
                power: {
                    path: "tizen/2.0/power",
                    feature: "http://tizen.org/privilege/power",
                    handleSubfeatures: true
                },
                push: {
                    path: "tizen/2.0/push",
                    feature: "http://tizen.org/privilege/push",
                    handleSubfeatures: true
                },
                systeminfo: {
                    path: "tizen/2.0/systeminfo",
                    feature: "http://tizen.org/privilege/system|http://tizen.org/privilege/systemmanager",
                    handleSubfeatures: true
                },
                systemsetting: {
                    path: "tizen/2.0/systemsetting",
                    feature: "http://tizen.org/privilege/setting",
                    handleSubfeatures: true
                },
                time: {
                    path: "tizen/2.0/time",
                    feature: "http://tizen.org/privilege/time",
                    handleSubfeatures: true
                }
            }
        }
    }
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec/btdevices', function (require, exports, module) {
/*
 *  Copyright 2012 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports = {
    "22:33:44:12:34:56": {
        "name": "Tizen Phone",
        "address": "22:33:44:12:34:56",
        "deviceClass": {
            "major": 0x02,
            "majorName": "PHONE",
            "minor": 0x03,
            "minorName": "PHONE_SMARTPHONE",
            "services": [0x0080],
            "servicesName": ["OBJECT_TRANSFER"]
        },
        "isTrusted": false,
        "services": {
            "5bce9431-6c75-32ab-afe0-2ec108a30860" : {
                "name": "Data Exchange",
                "uuid": "5bce9431-6c75-32ab-afe0-2ec108a30860",
                "protocol": "RFCOMM"
            },
            "3537d485-0c1e-445a-a066-43fafcfb61d1" : {
                "name": "Data Transfer",
                "uuid": "3537d485-0c1e-445a-a066-43fafcfb61d1",
                "protocol": "RFCOMM"
            }
        }
    },
    "22:33:44:12:34:88": {
        "name": "Keyboard",
        "address": "22:33:44:12:34:88",
        "deviceClass": {
            "major": 0x05,
            "majorName": "PERIPHERAL",
            "minor": 0x10,
            "minorName": "PERIPHERAL_KEYBOARD",
            "services": [0x0080],
            "servicesName": ["OBJECT_TRANSFER"]
        },
        "isTrusted": true,
        "services": {
            "3537d485-0c1e-445a-a066-43fafcfb61d1" : {
                "name": "Data Exchange",
                "uuid": "3537d485-0c1e-445a-a066-43fafcfb61d1",
                "protocol": "RFCOMM"
            }
        }
    },
    "22:33:44:88:34:58": {
        "name": "Tizen Laptop",
        "address": "22:33:44:88:34:58",
        "deviceClass": {
            "major": 0x01,
            "majorName": "COMPUTER",
            "minor": 0x03,
            "minorName": "COMPUTER_LAPTOP",
            "services": [0x0080],
            "servicesName": ["OBJECT_TRANSFER"]
        },
        "isTrusted": true,
        "services": {
            "3537d485-0c1e-445a-a066-43fafcfb61d1" : {
                "name": "Data Exchange",
                "uuid": "3537d485-0c1e-445a-a066-43fafcfb61d1",
                "protocol": "RFCOMM"
            }
        }
    }
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec/config', function (require, exports, module) {
/*
 *  Copyright 2011 Research In Motion Limited.
 *  Copyright 2011 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var utils = require('ripple/utils'),
    db = require('ripple/db'),
    constants = require('ripple/constants');

module.exports = {
    fileName: "config.xml",
    validateVersion: function (configValidationObject) {
        var valid = true;
        // no xmlns:JIL in wac 2.0 spec
        valid = !!configValidationObject.widget.validationResult[0].attributes.xmlns.valid;

        return valid;
    },
    extractInfo: function (configValidationObject) {
        if (!configValidationObject) {
            return null;
        }

        var widgetInfo = {},
            configFeatures,
            configPreferences,
            preferenceName,
            platform, rst, i, j,
            settingRst = {
                'screen-orientation': 'portrait',
                'context-menu': 'enable',
                'background-support': 'disable',
                encryption: 'disable',
                'install-location': 'auto',
                'hwkey-event': 'enable'
            };

        widgetInfo.id = configValidationObject.widget.validationResult[0].attributes.id.value || "";
        widgetInfo.name = configValidationObject.widget.children.name.validationResult[0].value;
        widgetInfo.icon = configValidationObject.widget.children.icon.validationResult[0].attributes.src.value;
        widgetInfo.version = configValidationObject.widget.validationResult[0].attributes.version.value;
        if (configValidationObject.widget.children.application.validationResult[0].valid) {
            widgetInfo.tizenAppId = configValidationObject.widget.children.application.validationResult[0].attributes.id.value;
            widgetInfo.tizenPackageId = configValidationObject.widget.children.application.validationResult[0].attributes.package.value;
        }

        widgetInfo.features = {};

        if (configValidationObject.widget.children.setting.hasOwnProperty('validationResult') === true) {
            rst = configValidationObject.widget.children.setting.validationResult;
            // the first one has higher priority per platform implementation
            for (i = rst.length -1 ; i >= 0; i--) {
                if (rst[i].valid === true) {
                    for (j in rst[i].attributes) {
                        if (rst[i].attributes[j].value !== undefined) {
                            settingRst[j] = rst[i].attributes[j].value;
                        }
                    }
                }
            }
            db.save("layout", settingRst["screen-orientation"]);
        }

        configFeatures = configValidationObject.widget.children.feature.validationResult;
        utils.forEach(configFeatures, function (f) {
            if (f.valid === true) {
                var feature = {id: f.attributes.name.value,
                         required: f.attributes.required.valid};
                widgetInfo.features[feature.id] = feature;
            }
        });

        widgetInfo.preferences = {};

        configPreferences = configValidationObject.widget.children.preference.validationResult;

        platform = require('ripple/platform');
        utils.forEach(configPreferences, function (preference) {
            preferenceName = preference.attributes.name.value;
            if (preferenceName) {
                widgetInfo.preferences[preferenceName] = {
                    "key": preferenceName,
                    "value": preference.attributes.value.value || "",
                    "readonly": preference.attributes.readonly.value === "true"
                };

                db.save(preferenceName,
                        widgetInfo.preferences[preferenceName].value,
                        platform.getPersistencePrefix(widgetInfo.id));
            }
        });

        return widgetInfo;
    },
    schema: {
        rootElement: "widget",
        widget: {
            nodeName: "widget",
            required: true,
            occurrence: 1,
            helpText: "\"widget\" element describes widget information in configuration documents and serves as a container for other elements. It must be used in the configuration document and may have the following child elments: name,description,icon,author,license,content,feature and preference.The \"widget\" element MAY have following attributes: id,version,height,width, defaultlocale, xml:lang and dir",
            attributes: {
                xmlns: {
                    attributeName: "xmlns",
                    required: true,
                    type: "list",
                    listValues: ["http://www.w3.org/ns/widgets"]
                },
                "xmlns:tizen": {
                    attributeName: "xmlns:tizen",
                    required: false,
                    type: "list",
                    listValues: ["http://tizen.org/ns/widgets"]
                },
                "xml:lang": {
                    attributeName: "xml:lang",
                    required: false,
                    type: "iso-language"
                },
                dir: {
                    attributeName: "dir",
                    required: false,
                    type: "list",
                    listValues: ["ltr", "rtl", "lro", "rlo"]
                },
                id: {
                    attributeName: "id",
                    required: false,
                    type: "string"
                },
                version: {
                    attributeName: "version",
                    required: false,
                    type: "string"
                },
                height: {
                    attributeName: "height",
                    required: false,
                    type: "integer"
                },
                width: {
                    attributeName: "width",
                    required: false,
                    type: "integer"
                },
                viewmodes: {
                    attributeName: "viewmodes",
                    required: false,
                    type: "list",
                    listValues: ["windowed", "floating", "fullscreen", "maximized", "minimized"]
                },
                defaultlocale: {
                    attributeName: "defaultlocale",
                    required: false,
                    type: "iso-language"
                },
            },
            children: {
                name: {
                    nodeName: "name",
                    required: false,
                    occurrence: 0,
                    type: "string",
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                            unique: true
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        "short": {
                            attributeName: "short",
                            required: false,
                            type: "string"
                        }
                    },
                    children: {
                        span: {
                            nodeName: "span",
                            required: false,
                            type: "string",
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "iso-language",
                                    unique: true
                                },
                                dir: {
                                    attributeName: "dir",
                                    required: false,
                                    type: "list",
                                    listValues: ["ltr", "rtl", "lro", "rlo"]
                                }
                            }
                        }
                    }
                },
                description: {
                    nodeName: "description",
                    required: false,
                    occurrence: 0,
                    type: "string",
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                            unique: true
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        }
                    },
                    children: {
                        span: {
                            nodeName: "span",
                            required: false,
                            type: "string",
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "iso-language",
                                    unique: true
                                },
                                dir: {
                                    attributeName: "dir",
                                    required: false,
                                    type: "list",
                                    listValues: ["ltr", "rtl", "lro", "rlo"]
                                }
                            }
                        }
                    }
                },
                author: {
                    nodeName: "author",
                    required: false,
                    occurrence: 0,
                    type: "string",
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        href: {
                            attributeName: "href",
                            required: false,
                            type: "regex",
                            regex: constants.REGEX.URL
                        },
                        email: {
                            attributeName: "email",
                            required: false,
                            type: "regex",
                            regex: constants.REGEX.EMAIL
                        }
                    },
                    children: {
                        span: {
                            nodeName: "span",
                            required: false,
                            type: "string",
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "iso-language",
                                    unique: true
                                },
                                dir: {
                                    attributeName: "dir",
                                    required: false,
                                    type: "list",
                                    listValues: ["ltr", "rtl", "lro", "rlo"]
                                }
                            }
                        }
                    }
                },
                license: {
                    nodeName: "license",
                    required: false,
                    occurrence: 0,
                    type: "string",
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        href: {
                            attributeName: "href",
                            type: "regex",
                            required: false,
                            regex: constants.REGEX.URL
                        }
                    },
                    children: {
                        span: {
                            nodeName: "span",
                            required: false,
                            type: "string",
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "iso-language",
                                    unique: true
                                },
                                dir: {
                                    attributeName: "dir",
                                    required: false,
                                    type: "list",
                                    listValues: ["ltr", "rtl", "lro", "rlo"]
                                }
                            }
                        }
                    }
                },
                icon: {
                    nodeName: "icon",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        src: {
                            attributeName: "src",
                            required: true,
                            type: "string"
                        },
                        width: {
                            attributeName: "width",
                            required: false,
                            type: "integer"
                        },
                        height: {
                            attributeName: "height",
                            required: false,
                            type: "integer"
                        }
                    }
                },
                content: {
                    nodeName: "content",
                    required: false,
                    occurrence: 1,
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                            unique: true
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        src: {
                            attributeName: "src",
                            required: true,
                            type: "string"
                        },
                        encoding: {
                            attributeName: "encoding",
                            required: false,
                            type: "string"
                        },
                        type: {
                            attributeName: "type",
                            required: false,
                            type: "string"
                        }
                    }
                },
                setting: {
                    nodeName: "tizen:setting",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        'screen-orientation': {
                            attributeName: "screen-orientation",
                            required: false,
                            type: "list",
                            listValues: ['portrait', 'landscape', 'auto']
                        },
                        'context-menu': {
                            attributeName: "context-menu",
                            required: false,
                            type: "list",
                            listValues: ['enable', 'disable']
                        },
                        'background-support': {
                            attributeName: "background-support",
                            required: false,
                            type: "list",
                            listValues: ['enable', 'disable']
                        },
                        'encryption': {
                            attributeName: "encryption",
                            required: false,
                            type: "list",
                            listValues: ['enable', 'disable']
                        },
                        'install-location': {
                            attributeName: "install-location",
                            required: false,
                            type: "list",
                            listValues: ['auto', 'internal-only', 'perfer-external']
                        },
                        'hwkey-event': {
                            attributeName: "hwkey-event",
                            required: false,
                            type: "list",
                            listValues: ['enable', 'disable']
                        }
                    }
                },
                application: {
                    nodeName: "tizen:application",
                    required: true,
                    occurrence: 1,
                    attributes: {
                        id: {
                            attributeName: "id",
                            required: true,
                            type: "string"
                        },
                        required_version: {
                            attributeName: "required_version",
                            required: true,
                            type: "list",
                            listValues: ['1.0', '2.0', '2.1', '2.2']
                        },
                        package: {
                            attributeName: "package",
                            required: false,
                            type: "string"
                        }
                    }
                },
                "tizen:content": {
                    nodeName: "tizen:content",
                    required: false,
                    occurrence: 1,
                    attributes: {
                        src: {
                            attributeName: "src",
                            required: true,
                            type: "string"
                        }
                    }
                },
                control: {
                    nodeName: "tizen:app-control",
                    required: false,
                    occurrence: 0,
                    children: {
                        src: {
                            nodeName: "tizen:src",
                            required: true,
                            occurence: 0,
                            attributes: {
                                name: {
                                    attributeName: "name",
                                    required: false,
                                    type: "string"
                                }
                            }
                        },
                        operation: {
                            nodeName: "tizen:operation",
                            required: true,
                            occurence: 0,
                            attributes: {
                                name: {
                                    attributeName: "name",
                                    required: false,
                                    type: "string"
                                }
                            }
                        },
                        uri: {
                            nodeName: "tizen:uri",
                            required: false,
                            occurence: 0,
                            attributes: {
                                name: {
                                    attributeName: "name",
                                    required: false,
                                    type: "string"
                                }
                            }
                        },
                        mime: {
                            nodeName: "tizen:mime",
                            required: false,
                            occurence: 0,
                            attributes: {
                                name: {
                                    attributeName: "name",
                                    required: false,
                                    type: "string"
                                }
                            }
                        }
                    }
                },
                "app-widget": {
                    nodeName: "tizen:app-widget",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        id: {
                            attributeName: "id",
                            required: true,
                            type: "string"
                        },
                        primary: {
                            attributeName: "primary",
                            required: true,
                            type: "list",
                            listValues: ['true', 'false']
                        },
                        "auto-launch": {
                            attributeName: "auto-launch",
                            required: false,
                            type: "list",
                            listValues: ['true', 'false']
                        },
                        "update-period": {
                            attributeName: "update-period",
                            required: false,
                            type: "integer"
                        }
                    },
                    children: {
                        "box-label": {
                            nodeName: "tizen:box-label",
                            required: true,
                            occurence: 1
                        },
                        "box-icon": {
                            nodeName: "tizen:box-icon",
                            required: true,
                            occurence: 1,
                            attributes: {
                                src: {
                                    attributeName: "src",
                                    required: true,
                                    type: "string"
                                }
                            }
                        },
                        "box-content": {
                            nodeName: "tizen:box-content",
                            required: true,
                            occurence: 1,
                            attributes: {
                                src: {
                                    attributeName: "src",
                                    required: true,
                                    type: "string"
                                },
                                "mouse-event": {
                                    attributeName: "mouse-event",
                                    required: false,
                                    type: "string"
                                },
                                "touch-event": {
                                    attributeName: "touch-event",
                                    required: false,
                                    type: "string"
                                }
                            },
                            children: {
                                "box-size": {
                                    nodeName: "tizen:box-size",
                                    required: false,
                                    occurence: 1,
                                    attributes: {
                                        "preview": {
                                            attributeName: "preview",
                                            required: false,
                                            type: "string"
                                        }
                                    }
                                },
                                pd: {
                                    nodeName: "tizen:pd",
                                    required: false,
                                    occurence: 1,
                                    attributes: {
                                        "src": {
                                            attributeName: "src",
                                            required: true,
                                            type: "string"
                                        },
                                        "width": {
                                            attributeName: "width",
                                            required: true,
                                            type: "integer"
                                        },
                                        "height": {
                                            attributeName: "height",
                                            required: true,
                                            type: "integer"
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                account: {
                    nodeName: "tizen:account",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        "multiple-account-support": {
                            attributeName: "multiple-account-support",
                            required: true,
                            type: "list",
                            listValues: ['true', 'false']
                        }
                    },
                    children: {
                        icon: {
                            nodeName: "tizen:icon",
                            required: false,
                            occurence: 1,
                            attributes: {
                                section: {
                                    attributeName: "section",
                                    required: true,
                                    type: "string"
                                }
                            }
                        },
                        "display-name": {
                            nodeName: "tizen:display-name",
                            required: false,
                            occurence: 1,
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "string"
                                }
                            }
                        },
                        capability: {
                            nodeName: "capability",
                            required: false,
                            occurence: 1
                        }
                    }
                },
                feature: {
                    nodeName: "tizen:privilege",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        name: {
                            attributeName: "name",
                            required: true,
                            type: "list",
                            listValues: ["http://www.w3.org/TR/battery-status/",
                                         "http://www.w3.org/TR/geolocation-API/",
                                         "http://www.w3.org/TR/touch-events/",
                                         "http://www.w3.org/TR/vibration/",
                                         "http://tizen.org/privilege/tizen",
                                         "http://tizen.org/privilege/alarm",
                                         "http://tizen.org/privilege/application.launch",
                                         "http://tizen.org/privilege/appmanager.kill", "http://tizen.org/privilege/appmanager.certificate",
                                         "http://tizen.org/privilege/bluetoothmanager", "http://tizen.org/privilege/bluetooth.admin",
                                         "http://tizen.org/privilege/bluetooth.gap", "http://tizen.org/privilege/bluetooth.spp",
                                         "http://tizen.org/privilege/bookmark.read", "http://tizen.org/privilege/bookmark.write",
                                         "http://tizen.org/privilege/calendar.read", "http://tizen.org/privilege/calendar.write",
                                         "http://tizen.org/privilege/callhistory.read", "http://tizen.org/privilege/callhistory.write",
                                         "http://tizen.org/privilege/contact.read", "http://tizen.org/privilege/contact.write",
                                         "http://tizen.org/privilege/content.read", "http://tizen.org/privilege/content.write",
                                         "http://tizen.org/privilege/datacontrol.consumer",
                                         "http://tizen.org/privilege/datasync",
                                         "http://tizen.org/privilege/download",
                                         "http://tizen.org/privilege/filesystem.read", "http://tizen.org/privilege/filesystem.write",
                                         "http://tizen.org/privilege/messaging.read", "http://tizen.org/privilege/messaging.write",
                                         "http://tizen.org/privilege/networkbearerselection",
                                         "http://tizen.org/privilege/nfc.common", "http://tizen.org/privilege/nfc.admin",
                                         "http://tizen.org/privilege/nfc.tag", "http://tizen.org/privilege/nfc.p2p",
                                         "http://tizen.org/privilege/notification",
                                         "http://tizen.org/privilege/packagemanager.install", "http://tizen.org/privilege/package.info",
                                         "http://tizen.org/privilege/power",
                                         "http://tizen.org/privilege/push",
                                         "http://tizen.org/privilege/setting",
                                         "http://tizen.org/privilege/system", "http://tizen.org/privilege/systemmanager",
                                         "http://tizen.org/privilege/time"]
                        },
                        required: {
                            attributeName: "required",
                            type: "boolean",
                            required: false
                        }
                    },
                    children: {
                        param: {
                            nodeName: "param",
                            required: false,
                            occurrence: 0,
                            attributes: {
                                "xml:lang": {
                                    attributeName: "xml:lang",
                                    required: false,
                                    type: "iso-language",
                                },
                                dir: {
                                    attributeName: "dir",
                                    required: false,
                                    type: "list",
                                    listValues: ["ltr", "rtl", "lro", "rlo"]
                                },
                                name: {
                                    attributeName: "name",
                                    required: true,
                                    type: "string",
                                },
                                value: {
                                    attributeName: "value",
                                    required: true,
                                    type: "string",
                                }
                            }
                        }
                    }
                },
                preference: {
                    nodeName: "preference",
                    required: false,
                    occurrence: 0,
                    attributes: {
                        "xml:lang": {
                            attributeName: "xml:lang",
                            required: false,
                            type: "iso-language",
                        },
                        dir: {
                            attributeName: "dir",
                            required: false,
                            type: "list",
                            listValues: ["ltr", "rtl", "lro", "rlo"]
                        },
                        name: {
                            attributeName: "name",
                            required: true,
                            type: "string"
                        },
                        value: {
                            type: "string",
                            required: false,
                            attributeName: "value"
                        },
                        readonly: {
                            attributeName: "readonly",
                            type: "boolean",
                            required: false
                        }
                    }
                }
            }
        }
    }
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec/device', function (require, exports, module) {
/*
 *  Copyright 2011 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var event = require('ripple/event'),
    utils = require('ripple/utils'),
    StorageTypeTable = {
        "UNKNOWN": "UNKNOWN",
        "INTERNAL": "INTERNAL",
        "MMC": "MMC",
        "USB_HOST": "USB_HOST"
    },
    NetworkTypeTable = {
        "NONE": "NONE",
        "2G": "2G",
        "2.5G": "2.5G",
        "3G": "3G",
        "4G": "4G",
        "WIFI": "WIFI",
        "ETHERNET": "ETHERNET",
        "UNKNOWN": "UNKNOWN"
    },
    LocaleTable = {
        "eng_USA": "eng_USA",
        "eng_CAN": "eng_CAN",
        "deu_DEU": "deu_DEU",
        "jpn_JPN": "jpn_JPN",
        "zho_CHN": "zho_CHN",
        "UNKNOWN": "UNKNOWN"
    },
    SimStateTable = {
        "ABSENT": "ABSENT",
        "INITIALIZING": "INITIALIZING",
        "READY": "READY",
        "PIN_REQUIRED": "PIN_REQUIRED",
        "PUK_REQUIRED":"PUK_REQUIRED",
        "NETWORK_LOCKED": "NETWORK_LOCKED",
        "SIM_LOCKED": "SIM_LOCKED",
        "UNKNOWN": "UNKNOWN"
    };

function deviceStatusEventTrigger(setting) {
    event.trigger("DeviceStatusChanged", [setting]);
}

module.exports = {
    "Config": {
        "vibratingMode": {
            "name": "Vibrator",
            "control": {
                "type": "checkbox",
                "value": true
            },
            "callback": function (setting) {
                event.trigger("VibratingModeChanged", [setting]);
            }
        },
        "lockScreen": {
            "name": "Lock Screen",
            "control": {
                "type": "checkbox",
                "value": false
            },
            "callback": function (setting) {
                event.trigger("LockScreenChanged", [setting]);
            }
        }
    },
    "DEVICE_ORIENTATION": {
        "status": {
            "name": "Status",
            "control": {
                "type": "label",
                "innertext": "PORTRAIT_PRIMARY",
                "value": "PORTRAIT_PRIMARY"
            },
            "event": "LayoutChanged"
        },
        "isAutoRotation": {
            "name": "Is Auto Rotation",
            "control": {
                "type": "label",
                "value": false
            }
        }
    },
    "CPU": {
        "load": {
            "name": "Load",
            "control": {
                "type": "number",
                "value": 0.1
            },
            "event": "CpuLoadChanged",
            "callback": function (setting) {
                if (setting > 1) setting = 1;
                if (setting < 0) setting = 0;
                event.trigger("CpuLoadChanged", [setting]);
            }
        }
    },
    "STORAGE": {
        "type": {
            "name": "Type",
            "control": {
                "type": "select",
                "value": StorageTypeTable["INTERNAL"]
            },
            "options": (function () {
                var optionList = {};
                utils.forEach(StorageTypeTable, function (key, value) {
                    optionList[key] = StorageTypeTable[value];
                });

                return optionList;
            }())
        },
        "capacity": {
            "name": "Capacity(bytes)",
            "control": {
                "type": "label",
                "value": 16000000000
            },
        },
        "availableCapacity": {
            "name": "AvailableCapacity(bytes)",
            "control": {
                "type": "number",
                "value": 12000000000
            },
            "callback": function (setting) {
                event.trigger("AvailCapacityChanged", [setting]);
            }
        },
        "isRemovable": {
            "name": "IsRemovable",
            "control": {
                "type": "checkbox",
                "value": true
            }
        }
    },
    "BUILD": {
        "model": {
            "name": "Model",
            "control": {
                "type": "label",
                "innertext": "tizen-2.2 build",
                "value": "tizen-2.2 build"
            }
        },
        "manufacturer": {
            "name": "Manufacturer",
            "control": {
                "type": "label",
                "innertext": "Tizen",
                "value": "Tizen"
            }
        },
        "buildVersion": {
            "name": "Build Version",
            "control": {
                "type": "label",
                "innertext": "TIZEN_WEB_SIMULATOR_000001",
                "value": "TIZEN_WEB_SIMULATOR_000001"
            }
        }
    },
    "LOCALE": {
        "language": {
            "name": "Language",
            "control": {
                "type": "select",
                "value": LocaleTable["eng_USA"]
            },
            "options": (function () {
                var optionList = {};
                utils.forEach(LocaleTable, function (key, value) {
                    optionList[key] = LocaleTable[value];
                });

                return optionList;
            }())
        },
        "country": {
            "name": "Country",
            "control": {
                "type": "select",
                "value": LocaleTable["eng_USA"]
            },
            "options": (function () {
                var optionList = {};
                utils.forEach(LocaleTable, function (key, value) {
                    optionList[key] = LocaleTable[value];
                });

                return optionList;
            }())
        }
    },
    "DISPLAY": {
        "resolutionWidth": {
            "name": "Resolution Width(pixels)",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "resolutionHeight": {
            "name": "Resolution Height(pixels)",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "dotsPerInchWidth": {
            "name": "DPI-X",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "dotsPerInchHeight": {
            "name": "DPI-Y",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "physicalWidth": {
            "name": "Physical Width(millimeters)",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "physicalHeight": {
            "name": "Physical Height(millimeters)",
            "control": {
                "type": "label",
                "value": 0
            }
        },
        "brightness": {
            "name": "Brightness",
            "control": {
                "type": "number",
                "value": 1
            },
            "event": "DisplayBrightnessChanged",
            "callback": function (setting) {
                if (setting > 1) setting = 1;
                if (setting < 0) setting = 0;
                event.trigger("DisplayBrightnessChanged", [setting]);
            }
        }
    },
    "NETWORK": {
        "networkType": {
            "name": "Network Type",
            "control" : {
                "type": "select",
                "value": NetworkTypeTable["NONE"]
            },
            "options": (function () {
                var optionList = {};
                utils.forEach(NetworkTypeTable, function (key, value) {
                    optionList[key] = NetworkTypeTable[value];
                });

                return optionList;
            }())
        }
    },
    "WIFI_NETWORK": {
        "status": {
            "name": "Status",
            "control": {
                "type": "checkbox",
                "value": false
            },
            "event": "WiFiNetworkStatusChanged",
            "callback": function (setting) {
                event.trigger("WiFiNetworkStatusChanged", [setting]);
            }
        },
        "ssid": {
            "name": "SSID",
            "control": {
                "type": "text",
                "value": "Tizen WiFi"
            }
        },
        "ipAddress": {
            "name": "IP Address",
            "control": {
                "type": "text",
                "value": "192.168.0.1"
            }
        },
        "ipv6Address": {
            "name": "IPv6 Address",
            "control": {
                "type": "text",
                "value": "2001:db8:85a3:0:0:0:70:7334"
            }
        },
        "signalStrength": {
            "name": "Signal Strength",
            "control": {
                "type": "select",
                "value": 0
            },
            "options": (function () {
                var i,
                    optionList = {};

                for (i = 0; i <= 10; i++) {
                    optionList[i] = i;
                }

                return optionList;
            }())
        }
    },
    "CELLULAR_NETWORK": {
        "status": {
            "name": "Status",
            "control": {
                "type": "checkbox",
                "value": true
            },
            "event": "CellularNetworkStatusChanged",
            "callback": function (setting) {
                event.trigger("CellularNetworkStatusChanged", [setting]);
            }
        },
        "apn": {
            "name": "APN",
            "control": {
                "type": "text",
                "value": "Tizen"
            }
        },
        "ipAddress": {
            "name": "IP Address",
            "control": {
                "type": "text",
                "value": "10.0.2.16"
            }
        },
        "ipv6Address": {
            "name": "IPv6 Address",
            "control": {
                "type": "text",
                "value": "2001:db8:85a3:0:0:0:70:7334"
            }
        },
        "mcc": {
            "name": "MCC",
            "control": {
                "type": "number",
                "value": 460
            }
        },
        "mnc": {
            "name": "MNC",
            "control": {
                "type": "number",
                "value": 0
            }
        },
        "cellId": {
            "name": "Cell ID",
            "control": {
                "type": "number",
                "value": 0
            }
        },
        "lac": {
            "name": "LAC",
            "control": {
                "type": "number",
                "value": 0
            }
        },
        "isRoaming": {
            "name": "Roaming",
            "control": {
                "type": "checkbox",
                "value": true
            }
        },
        "isFlightMode": {
            "name": "Flight Mode",
            "control": {
                "type": "checkbox",
                "value": false
            },
            "callback": function (setting) {
                event.trigger("FlightModeChanged", [setting]);
            }
        },
        "imei": {
            "name": "IMEI",
            "control": {
                "type": "text",
                "value": "012417005203000"
            }
        }
    },
    "SIM": {
        "state": {
            "name": "State",
            "control": {
                "type": "select",
                "value": SimStateTable["READY"]
            },
            "options": (function () {
                var optionList = {};
                utils.forEach(SimStateTable, function (key, value) {
                    optionList[key] = SimStateTable[value];
                });

                return optionList;
            }())
        },
        "operatorName": {
            "name": "Operator Name",
            "control": {
                "type": "text",
                "value": "Tizen"
            }
        },
        "msisdn": {
            "name": "MSISDN",
            "control": {
                "type": "text",
                "value": "088123456789"
            }
        },
        "iccid": {
            "name": "ICCID",
            "control": {
                "type": "text",
                "value": "123000MFSSYYGXXXXXXP"
            }
        },
        "mcc": {
            "name": "MCC",
            "control": {
                "type": "number",
                "value": 460
            }
        },
        "mnc": {
            "name": "MNC",
            "control": {
                "type": "number",
                "value": 0
            }
        },
        "msin": {
            "name": "MSIN",
            "control": {
                "type": "text",
                "value": "H1 H2 H3 S 12345"
            }
        },
        "spn": {
            "name": "SPN",
            "control": {
                "type": "text",
                "value": "TizenSPN"
            }
        }
    },
    "PERIPHERAL": {
        "isVideoOutputOn": {
            "name": "Video Output",
            "control": {
                "type": "checkbox",
                "value": false
            }
        }
    }
};

});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec/sensor', function (require, exports, module) {
/*
 *  Copyright 2012 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var event = require('ripple/event');

function sensorStatusEventTrigger(setting) {
    event.trigger("SensorStatusChanged", [setting]);
}

module.exports = {
    "Accelerometer": {
        "resolution": 0.039239998906850815,
        "minDelay": 20,
        "range": 20.051639556884766,
        "name": "Accelerometer",
        "type": "Accelerometer"
    },
    "MagneticField": {
        "x": {
            "name": "X",
            "control": {
                "type": "range",
                "value": 100.0000000000000000,
                "min": 0.0000000000000000,
                "max": 200.0000000000000000,
                "step": 0.0000000000000001
            },
            "callback": function (setting) {
                event.trigger("MagneticField-xChanged", [setting]);
            }
        },

        "y": {
            "name": "Y",
            "control": {
                "type": "range",
                "value": 100.0000000000000000,
                "min": 0.0000000000000000,
                "max": 200.0000000000000000,
                "step": 0.0000000000000001
            },
            "callback": function (setting) {
                event.trigger("MagneticField-yChanged", [setting]);
            }
        },

        "z": {
            "name": "Z",
            "control": {
                "type": "range",
                "value": 100.0000000000000000,
                "min": 0.0000000000000000,
                "max": 200.0000000000000000,
                "step": 0.0000000000000001
            },
            "callback": function (setting) {
                event.trigger("MagneticField-zChanged", [setting]);
            }
        },

        "resolution": 1,
        "minDelay": 20,
        "range": 359,
        "name": "MagneticField",
        "type": "MagneticField"
    },
    "Rotation": {
        "resolution": 1,
        "minDelay": 20,
        "range": 359,
        "name": "Rotation",
        "type": "Rotation"
    },
    "Orientation": {
        "resolution": 1,
        "minDelay": 20,
        "range": 359,
        "name": "Orientation",
        "type": "Orientation"
    }
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/spec/ui', function (require, exports, module) {
/*
 *  Copyright 2011 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
module.exports = {
    plugins: [
        "sensors",
        "communication",
        "geoView",
        "widgetConfig",
        "deviceSettings",
        "application",
        "network",
        "power",
        "download",
        "package"
    ]
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/typecast', function (require, exports, module) {
/*
 *  Copyright 2013 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var typedef = require('ripple/platform/tizen/2.0/typedef'),
    errorcode = require('ripple/platform/tizen/2.0/errorcode'),
    WebAPIException = require('ripple/platform/tizen/2.0/WebAPIException'),
    TypeCoerce = require('ripple/platform/tizen/2.0/typecoerce'),
    _self = {};

function _cast(pattern, obj, isDuplicate) {
    var tc, tcFunc;

    if (pattern === null)
        return;

    tc = new TypeCoerce(pattern);
    tcFunc = isDuplicate ? tc.copy : tc.cast;

    if ((obj = tcFunc(obj)) === null) {
        throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
    }

    return obj;
}

function _castType(pattern) {
    /*
     * Type cast for each known type. The function name is the exact name of the
     * corresponding type.
     *
     * obj
     *    Variable to be casted
     *
     * aux
     *    Auxiliary descriptor of obj. It can be any one or combination of below
     *    strings, or ignored in most cases.
     *
     *    "?"     Nullable types
     *    "[]"    Array
     *    "+"     Deep copy
     *
     * Return
     *    Casted or duplicated object.
     */

    return function (obj, aux) {
        var type, isNullable, isDuplicate;

        aux = aux ? String(aux) : "";
        type = (aux.indexOf("[]") !== -1) ? [pattern] : pattern;
        isNullable = (aux.indexOf("?") !== -1);
        isDuplicate = (aux.indexOf("+") !== -1);

        if ((obj === null) || (obj === undefined)) {
            if (!isNullable) {
                throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
            }
            return obj;
        }

        return _cast(type, obj, isDuplicate);
    };
}

function _castConstructor(name) {
    var constructors, _hook, vtc, isOverloaded, castConstructor;

    /*
     * Type cast for constructor. The function name is the exact name of the
     * object type.
     *
     * argv
     *    arguments. The keyword 'arguments' will always be passed in.
     */

    function castUnique(argv) {
        _cast(constructors, argv, false);
    }

    /*
     * Type cast for overloaded constructors. The function name is the exact
     * name of the object type.
     *
     * argv
     *    arguments. The keyword 'arguments' will always be passed in.
     *
     * scope
     *    'this' of the original constructor.
     *
     * voc
     *    Array of overloaded constructors callback
     */

    function castOverload(argv, scope, voc) {
        var iOverload;

        if (!vtc) {
            vtc = [];
            constructors.forEach(function (c) {
                vtc.push((c === null) ? null : new TypeCoerce(c));
            });
        }

        vtc.some(function (tc, index) {
            if (tc && (tc.cast(argv) === null))
                return false;

            iOverload = index;
            return true;
        });

        if (iOverload === undefined) {
            throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
        }

        return (voc && voc[iOverload].apply(scope, argv));
    }

    constructors = typedef.constructor[name];

    if (name in _self) {
        _hook = _self[name];
    }

    isOverloaded = (Object.prototype.toString.call(constructors) ===
            "[object Array]");
    castConstructor = isOverloaded ? castOverload : castUnique;

    return function (argv, scope) {
        if (Object.prototype.toString.call(argv) !== "[object Arguments]") {
            return (_hook && _hook.apply(this, arguments));
        }

        if (!(scope instanceof argv.callee)) {
            throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR, null, "TypeError");
        }

        castConstructor.apply(this, arguments);
    };
}

function _castInterface(name) {
    var _interface, _hook;

    _interface = typedef.interface[name];

    if (name in _self) {
        _hook = _self[name];
    }

    /*
     * Type cast for each known method of interface. The function name is the
     * exact name of the corresponding interface.
     *
     * method
     *    String of method name
     *
     * argv
     *    arguments. The keyword 'arguments' will always be passed in.
     *
     * isDuplicate
     *    A boolean value to indicate whether arguments will be copied or not.
     */

    return function (method, argv, isDuplicate) {
        if ((typeof method !== "string") || (typeof argv !== "object")) {
            return (_hook && _hook.apply(this, arguments));
        }

        _cast(_interface[method], argv, isDuplicate);
    };
}

(function () {
    var i;

    for (i in typedef) {
        _self[i] = _castType(typedef[i]);
    }

    for (i in typedef.constructor) {
        _self[i] = _castConstructor(i);
        typedef[i]._constructor = i;
    }

    for (i in typedef.interface) {
        _self[i] = _castInterface(i);
    }
}());

module.exports = _self;
});
define.unordered = true;
define('ripple/platform/tizen/2.0/typecoerce', function (require, exports, module) {
/*
 *  Copyright 2013 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var t = require('ripple/platform/tizen/2.0/typedef'),
    _self;

_self = function (pattern) {
    var typeCoerce, typeOfPattern;

    // private
    function getExtendedType(val) {
        var type, attr;

        if (typeof val === "object") {
            if ("_dictionary" in val) {
                return "dictionary";
            }

            type = "Object";

            for (attr in val) {
                if (attr === "0") {
                    type = "Arguments";
                } else if (val[attr] === "Callback") {
                    type = "Callback";
                }
                break;
            }

            return type;
        }

        switch (val) {
        case "Callback":
            type = "Function";
            break;

        case "any": // Any type
        case "byte":
        case "octet":
        case "unsigned long":
            type = val;
            break;

        case "double":
        case "float":
            type = "float";
            break;

        default:    // Derivative type name: e.g., "AbstractFilter"
            type = "";
            break;
        }

        return type;
    }

    function getType(val, isPattern) {
        var type = Object.prototype.toString.call(val);

        switch (type) {
        case "[object Array]":
            type = (isPattern && (val.length > 1) &&
                (typeof val[0] === "string")) ? "enum" : "Array";
            break;

        case "[object Arguments]":
            type = "Arguments";
            break;

        case "[object Boolean]":
            type = "boolean";
            break;

        case "[object Date]":
            type = "Date";
            break;

        case "[object Function]":
            type = "Function";
            break;

        case "[object Number]":
            type = "Number";
            break;

        case "[object Object]":
            type = isPattern ? getExtendedType(val) : "Object";
            break;

        case "[object String]":
            type = (isPattern && !!val) ? getExtendedType(val) : "DOMString";
            break;
        }

        return type;
    }

    function instanceOfPattern(pattern, obj) {
        var ret, i, derived;

        if ("_constructor" in pattern) {
            if (obj instanceof window.tizen[pattern._constructor]) {
                return -1;
            }
            ret = NaN;
        } else {
            ret = -1;
        }

        if (!("_derived" in pattern)) {
            return ret;
        }

        for (i in pattern._derived) {
            derived = pattern._derived[i];

            if (!isNaN(instanceOfPattern(derived, obj))) {
                return i;
            }
        }

        return NaN;
    }

    function toInteger(x) {
        return (x < 0) ? Math.ceil(x) : Math.floor(x);
    }

    function modulo(a, b) {
        return a - Math.floor(a / b) * b;
    }

    function toUInt32(x) {
        x = Number(x);

        if (isNaN(x) || !isFinite(x))
            return null;

        return modulo(toInteger(x), Math.pow(2, 32));
    }

    // public
    function cast(obj) {
        var typeMap,
            typeOfObj = getType(obj, false);

        typeMap = {
            "Arguments": function () {
                var i, isNullable, ret;

                for (i in pattern) {
                    if (i === "_optional")
                        continue;

                    isNullable = !!(pattern._optional && pattern._optional[i]);

                    if (i > obj.length - 1) {
                        if (!isNullable) {
                            return null;
                        }
                        obj[i] = null;
                        continue;
                    }

                    if ((obj[i] === null) || (obj[i] === undefined)) {
                        if (!isNullable || ((i in obj) && (obj[i] !== null))) {
                            return null;
                        }
                    } else {
                        ret = _self(pattern[i]).cast(obj[i]);
                        if (ret === null) {
                            return null;
                        }
                        obj[i] = ret;
                    }
                }

                return obj;
            },

            "Array": function () {
                var elementType, i, ret;

                if (typeOfObj !== typeOfPattern) {
                    return null;
                }

                elementType = _self(pattern[0]);
                for (i in obj) {
                    ret = elementType.cast(obj[i]);
                    if (ret === null) {
                        return null;
                    }
                    obj[i] = ret;
                }

                return obj;
            },

            "Callback": function () {
                var attr;

                if (typeOfObj !== "Object") {
                    return null;
                }

                for (attr in pattern) {
                    if (attr in obj) {
                        obj[attr] = _self(pattern[attr]).cast(obj[attr]);
                        if (obj[attr] === null) {
                            return null;
                        }
                    }
                }

                return obj;
            },

            "DOMString": function () {
                switch (typeOfObj) {
                case "Date":
                case "DOMString":
                case "Number":
                    obj = String(obj).trim();
                    break;

                default:
                    obj = null;
                    break;
                }

                return obj;
            },

            "Date": function () {
                return (typeOfObj === typeOfPattern) ? obj : null;
            },

            "Function": function () {
                return (typeOfObj === typeOfPattern) ? obj : null;
            },

            "Number": function () {
                var n = toInteger(obj);

                if (isNaN(n))
                    return null;

                return (obj === n) ? n : parseFloat(obj);
            },

            "Object": function () {
                var attr, iInstance, ret;

                if (typeOfObj !== typeOfPattern) {
                    return null;
                }

                iInstance = instanceOfPattern(pattern, obj);
                if (isNaN(iInstance)) {
                    return null;
                }

                for (attr in pattern) {
                    switch (attr) {
                    case "_optional":
                    case "_constructor":
                        break;

                    case "_derived":
                        if (iInstance !== -1) {
                            ret = _self(pattern._derived[iInstance]).cast(obj);
                            if (ret === null) {
                                return null;
                            }
                        }
                        break;

                    default:
                        if (!pattern._optional || !pattern._optional[attr] ||
                                (obj[attr] !== undefined) &&
                                (obj[attr] !== null)) {
                            ret = _self(pattern[attr]).cast(obj[attr]);
                            if (ret === null) {
                                return null;
                            }
                            obj[attr] = ret;
                        }
                        break;
                    }
                }

                return obj;
            },

            "any": function () {
                return obj;
            },

            "boolean": function () {
                return (typeOfObj === typeOfPattern) ? obj : null;
            },

            "dictionary": function () {
                var attr, ret;

                if (typeOfObj !== "Object") {
                    return null;
                }

                for (attr in pattern) {
                    if ((attr in obj) && (obj[attr] !== null) &&
                            (obj[attr] !== undefined)) {
                        ret = _self(pattern[attr]).cast(obj[attr]);
                        if (ret === null) {
                            return null;
                        }
                        obj[attr] = ret;
                    }
                }

                return obj;
            },

            "enum": function () {
                var i;

                obj = String(obj).trim();
                for (i in pattern) {
                    if (obj === pattern[i]) {
                        return obj;
                    }
                }

                return null;
            },

            "float": function () {
                var f = parseFloat(obj, 10);

                return (isNaN(f) ? null : f);
            },

            "unsigned long": function () {
                var n;

                n = toUInt32(obj);

                return (n === null) ? null : n;
            },

            "octet": function () {
                var n;

                try {
                    n = Number(obj);

                    return ((!isNaN(n) && (n == obj) &&
                            (0 <= n) && (n <= 0xff)) ? n : null);
                } catch (e) {
                    return null;
                }
            },

            "byte": function () {
                var n, ch;

                switch (typeOfObj) {
                case "Number":
                    try {
                        n = Number(obj);

                        return ((!isNaN(n) && (n == obj) &&
                                (0 <= n) && (n <= 0xff)) ? n : null);
                    } catch (e) {
                        return null;
                    }
                    break;

                case "DOMString":
                    if (obj.length > 1)
                        return null;

                    try {
                        ch = obj.charCodeAt();

                        return ((!isNaN(ch) && (0 <= ch) &&
                                (ch <= 0xff)) ? String(obj) : null);
                    } catch (e) {
                        return null;
                    }
                    break;

                default:
                    break;
                }

                return null;
            },

            "": function () {
                return _self(t[pattern]).cast(obj);
            }
        };

        return typeMap[typeOfPattern]();
    }

    function copy(obj) {
        var typeMap,
            typeOfObj = getType(obj, false);

        typeMap = {
            "Arguments": function () {
                var i, isNullable, ret = [];

                for (i in pattern) {
                    if (i === "_optional")
                        continue;

                    isNullable = !!(pattern._optional && pattern._optional[i]);

                    if (i > obj.length - 1) {
                        if (!isNullable) {
                            return null;
                        }
                        ret[i] = null;
                        continue;
                    }

                    if ((obj[i] === null) || (obj[i] === undefined)) {
                        if (!isNullable || ((i in obj) && (obj[i] !== null))) {
                            return null;
                        }
                    } else if ((ret[i] = _self(pattern[i])
                            .copy(obj[i])) === null) {
                        return null;
                    }
                }

                for (i in ret) {
                    obj[i] = ret[i];
                }

                return obj;
            },

            "Array": function () {
                var arr = [], elementType, i;

                if (typeOfObj !== typeOfPattern) {
                    return null;
                }

                elementType = _self(pattern[0]);
                for (i in obj) {
                    if (obj[i]) {
                        arr[i] = elementType.copy(obj[i]);
                        if (arr[i] === null)
                            return null;
                    }
                }

                return arr;
            },

            "Callback": function () {
                var ret = {}, attr;

                if (typeOfObj !== "Object") {
                    return null;
                }

                for (attr in pattern) {
                    if (attr in obj) {
                        ret[attr] = _self(pattern[attr]).copy(obj[attr]);
                        if (ret[attr] === null) {
                            return null;
                        }
                    }
                }

                return ret;
            },

            "Object": function () {
                var ret = {}, iInstance, attr, derived, i;

                if (typeOfObj !== typeOfPattern) {
                    return null;
                }

                iInstance = instanceOfPattern(pattern, obj);
                if (isNaN(iInstance)) {
                    return null;
                }

                if ("_constructor" in pattern) {
                    ret.__proto__ = window.tizen[pattern._constructor].prototype;
                }

                for (attr in pattern) {
                    switch (attr) {
                    case "_optional":
                    case "_constructor":
                        break;

                    case "_derived":
                        if (iInstance !== -1) {
                            derived = _self(pattern._derived[iInstance])
                                    .copy(obj);

                            for (i in derived) {
                                ret[i] = derived[i];
                            }
                        }
                        break;

                    default:
                        if (!pattern._optional || !pattern._optional[attr] ||
                                (obj[attr] !== undefined) &&
                                (obj[attr] !== null)) {
                            ret[attr] = _self(pattern[attr]).copy(obj[attr]);
                            if (ret[attr] === null) {
                                return null;
                            }
                        }
                        break;
                    }
                }

                return ret;
            },

            "dictionary": function () {
                var ret = {}, attr;

                if (typeOfObj !== "Object") {
                    return null;
                }

                for (attr in pattern) {
                    if ((attr in obj) && (obj[attr] !== null) &&
                            (obj[attr] !== undefined)) {
                        ret[attr] = _self(pattern[attr]).copy(obj[attr]);
                        if (ret[attr] === null) {
                            return null;
                        }
                    }
                }

                return ret;
            },

            "": function () {
                return _self(t[pattern]).copy(obj);
            }
        };

        return (typeOfPattern in typeMap) ? typeMap[typeOfPattern]() :
                cast(obj);
    }

    function match(obj) {
        var typeMap,
            typeOfObj = getType(obj, false);

        typeMap = {
            "Array": function () {
                var elementType, i;

                if (typeOfObj !== typeOfPattern)
                    return false;

                elementType = _self(pattern[0]);
                for (i in obj) {
                    if (!elementType.match(obj[i])) {
                        return false;
                    }
                }

                return true;
            },

            "Callback": function () {
                var attr, isMatched = true;

                if (typeOfObj !== "Object") {
                    return false;
                }

                for (attr in pattern) {
                    if (attr in obj) {
                        isMatched = _self(pattern[attr]).match(obj[attr]);
                        if (!isMatched) {
                            break;
                        }
                    }
                }

                return isMatched;
            },

            "DOMString": function () {
                return (typeOfObj === typeOfPattern);
            },

            "Date": function () {
                return (typeOfObj === typeOfPattern);
            },

            "Function": function () {
                return (typeOfObj === typeOfPattern);
            },

            "Number": function () {
                return (typeOfObj === typeOfPattern);
            },

            "Object": function () {
                var iInstance, attr, isMatched = false;

                if (typeOfObj !== typeOfPattern)
                    return false;

                iInstance = instanceOfPattern(pattern, obj);
                if (isNaN(iInstance)) {
                    return false;
                }

                for (attr in pattern) {
                    switch (attr) {
                    case "_optional":
                    case "_constructor":
                        break;

                    case "_derived":
                        if (iInstance !== -1) {
                            isMatched = _self(pattern._derived[iInstance])
                                    .match(obj);
                        }
                        break;

                    default:
                        if (pattern._optional && pattern._optional[attr]) {
                            isMatched = ((obj[attr] === null) ||
                                    (obj[attr] === undefined) ||
                                    _self(pattern[attr]).match(obj[attr]));
                        } else {
                            isMatched = (obj[attr] !== undefined) &&
                                    _self(pattern[attr]).match(obj[attr]);
                        }
                        break;
                    }

                    if (!isMatched)
                        break;
                }

                /*// Check if verbose attributes are present
                if (isMatched) {
                    for (attr in obj) {
                        if (pattern[attr] === undefined) {
                            isMatched = false;
                            break;
                        }
                    }
                }*/

                return isMatched;
            },

            "any": function () {
                return true;
            },

            "boolean": function () {
                return (typeOfObj === typeOfPattern);
            },

            "dictionary": function () {
                var attr, isMatched = true;

                if (typeOfObj !== "Object") {
                    return false;
                }

                for (attr in pattern) {
                    if ((attr in obj) && (obj[attr] !== null) &&
                            (obj[attr] !== undefined)) {
                        isMatched = _self(pattern[attr]).match(obj[attr]);
                        if (!isMatched)
                            break;
                    }
                }

                return isMatched;
            },

            "enum": function () {
                for (var i in pattern) {
                    if (obj === pattern[i]) {
                        return true;
                    }
                }

                return false;
            },

            "float": function () {
                return (typeOfObj === "Number");
            },

            "unsigned long": function () {
                var n;

                n = toUInt32(obj);

                return (n !== null);
            },

            "octet": function () {
                var n;

                try {
                    n = Number(obj);

                    return (!isNaN(n) && (n == obj) &&
                            (0 <= n) && (n <= 0xff));
                } catch (e) {
                    return false;
                }
            },

            "byte": function () {
                var n, ch;

                switch (typeOfObj) {
                case "Number":
                    try {
                        n = Number(obj);

                        return (!isNaN(n) && (n == obj) &&
                                (0 <= n) && (n <= 0xff));
                    } catch (e) {
                        return false;
                    }
                    break;

                case "DOMString":
                    if (obj.length > 1)
                        return false;

                    try {
                        ch = obj.charCodeAt();

                        return (!isNaN(ch) && (0 <= ch) && (ch <= 0xff));
                    } catch (e) {
                        return false;
                    }
                    break;

                default:
                    break;
                }

                return false;
            },

            "Arguments": function () {
                return true;
            },

            "": function () {
                return _self(t[pattern]).match(obj);
            }
        };

        return typeMap[typeOfPattern]();
    }

    typeOfPattern = getType(pattern, true);

    typeCoerce = {
        cast:  cast,
        copy:  copy,
        match: match
    };

    return typeCoerce;
};

module.exports = _self;
});
define.unordered = true;
define('ripple/platform/tizen/2.0/typedef', function (require, exports, module) {
/*
 *  Copyright 2013 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _t, _c, _i;

/*
 * Primitive type definition
 */

_t = {
    // Basic
    Callback:                           "Callback",
    DOMString:                          "",
    Date:                               new Date(),
    Function:                           function () {},
    any:                                "any",
    boolean:                            false,
    byte:                               "byte",
    double:                             "double",
    float:                              "float",
    long:                               0,
    octet:                              "octet",
    short:                              0,
    "unsigned long":                    "unsigned long",
    "unsigned long long":               0,
    "unsigned short":                   0,

    // Common
    FilterMatchFlag:                    ["EXACTLY", "FULLSTRING", "CONTAINS",
                                         "STARTSWITH", "ENDSWITH", "EXISTS"],
    SortModeOrder:                      ["ASC", "DESC"],
    CompositeFilterType:                ["UNION", "INTERSECTION"],

    TimeDurationUnit:                   ["MSECS", "SECS", "MINS", "HOURS", "DAYS"],
    // Bluetooth
    BluetoothSocketState:               ["CLOSED", "OPEN"],
    BluetoothProfileType:               ["HEALTH", "HEALTH"],
    BluetoothHealthChannelType:         ["RELIABLE", "STREAMING"],

    // Calendar
    ByDayValue:                         ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],

    // Contact
    ContactTextFormat:                  ["VCARD_30", "VCARD_30"],    // Enum must has more than one value

    // Content
    ContentDirectoryStorageType:        ["INTERNAL", "EXTERNAL"],
    ContentType:                        ["IMAGE", "VIDEO", "AUDIO", "OTHER"],
    AudioContentLyricsType:             ["SYNCHRONIZED", "UNSYNCHRONIZED"],
    ImageContentOrientation:            ["NORMAL", "FLIP_HORIZONTAL", "ROTATE_180",
                                         "FLIP_VERTICAL", "TRANSPOSE", "ROTATE_90",
                                         "TRANSVERSE", "ROTATE_270"],

    // Data Control
    DataType:                           ["MAP", "SQL"],

    // Data Synchronization
    SyncMode:                           ["MANUAL", "PERIODIC", "PUSH"],
    SyncType:                           ["TWO_WAY", "SLOW",
                                         "ONE_WAY_FROM_CLIENT",
                                         "REFRESH_FROM_CLIENT",
                                         "ONE_WAY_FROM_SERVER",
                                         "REFRESH_FROM_SERVER"],
    SyncInterval:                       ["5_MINUTES", "15_MINUTES", "1_HOUR",
                                         "4_HOURS", "12_HOURS", "1_DAY",
                                         "1_WEEK", "1_MONTH"],
    SyncServiceType:                    ["CONTACT", "EVENT"],
    SyncStatus:                         ["SUCCESS", "FAIL", "STOP", "NONE"],

    // Download
    DownloadState:                      ["QUEUED", "DOWNLOADING", "PAUSED",
                                         "CANCELED", "COMPLETED", "FAILED"],
    DownloadNetworkType:                ["CELLULAR", "WIFI", "ALL"],

    // Messaging
    MessageServiceTag:                  ["messaging.sms", "messaging.mms", "messaging.email"],

    // Network Bearer Selection
    NetworkType:                        ["CELLULAR", "UNKNOWN"],

    // NFC
    NDEFRecordTextEncoding:             ["UTF8", "UTF16"],
    NFCTagType:                         ["GENERIC_TARGET", "ISO14443_A",
                                         "ISO14443_4A", "ISO14443_3A", "MIFARE_MINI",
                                         "MIFARE_1K", "MIFARE_4K", "MIFARE_ULTRA",
                                         "MIFARE_DESFIRE", "ISO14443_B",
                                         "ISO14443_4B", "ISO14443_BPRIME", "FELICA",
                                         "JEWEL", "ISO15693", "UNKNOWN_TARGET"],

    // Notification
    NotificationType:                   ["STATUS", "STATUS"],
    StatusNotificationType:             ["SIMPLE", "THUMBNAIL", "ONGOING",
                                         "PROGRESS"],
    NotificationProgressType:           ["PERCENTAGE", "BYTE"],

    // System Info
    SystemInfoPropertyId:               ["BATTERY", "CPU", "STORAGE", "DISPLAY",
                                         "DEVICE_ORIENTATION", "BUILD",
                                         "LOCALE", "NETWORK", "WIFI_NETWORK",
                                         "CELLULAR_NETWORK", "SIM", "PERIPHERAL"],
    SystemInfoNetworkType:              ["NONE", "2G", "2.5G", "3G", "4G",
                                         "WIFI", "ETHERNET", "UNKNOWN"],
    SystemInfoDeviceOrientationStatus:  ["PORTRAIT_PRIMARY",
                                         "PORTRAIT_SECONDARY",
                                         "LANDSCAPE_PRIMARY",
                                         "LANDSCAPE_SECONDARY"],
    SystemInfoSimState:                 ["ABSENT", "INITIALIZING", "READY",
                                         "PIN_REQUIRED", "PUK_REQUIRED",
                                         "NETWORK_LOCKED", "SIM_LOCKED",
                                         "UNKNOWN"],
    SystemInfoProfile:                  ["MOBILE_FULL", "MOBILE_WEB"],

    // System Setting
    SystemSettingType:                  ["HOME_SCREEN", "LOCK_SCREEN",
                                         "INCOMING_CALL", "NOTIFICATION_EMAIL"]
};

/*
 * Derivative type definition
 */

/*
 * Object attributes
 *     Contruct a prototype of an object. Specify a primitive type for each attribute.
 *
 * _optional
 *     Optional attributes table, which consists of two types of attributes,
 *
 *     nullable
 *         Nullable attributes, marked as '?' in IDL.
 *
 *     undefined
 *         Array type attributes, that not definitely specified to be
 *         initialized as an empty array, i.e., undefined-initialized array.
 *
 * _derived
 *     Derived types, which used in two cases of definition,
 *
 *     Subtype list
 *         An array consists of derived subtypes. It exists in the definition of
 *         a base type.
 *
 *     Union types
 *         An array consists of member types. It exists in the definition of
 *         a union type.
 *
 * _dictionary
 *     Dictionary type, which indicates that the object is a dictionary type.
 */

/*
 * Common
 */

_t.AttributeFilter = {
    attributeName: _t.DOMString,
    matchFlag:     _t.FilterMatchFlag,
    matchValue:    _t.any
};

_t.AttributeRangeFilter = {
    attributeName: _t.DOMString,
    initialValue:  _t.any,
    endValue:      _t.any
};

_t.CompositeFilter = {
    type:    _t.CompositeFilterType,
    filters: ["AbstractFilter"]     // Recursive expansion
};

_t.AbstractFilter = {
    _derived: [_t.AttributeFilter, _t.AttributeRangeFilter, _t.CompositeFilter]
};

_t.SortMode = {
    attributeName: _t.DOMString,
    order:         _t.SortModeOrder
};

_t.SimpleCoordinates = {
    latitude:  _t.double,
    longitude: _t.double
};

_t.TimeDuration = {
    length: _t["unsigned long long"],
    unit:   _t.TimeDurationUnit
};


_t.SuccessCallback = _t.Function;
_t.ErrorCallback   = _t.Function;

/*
 * Alarm
 */

_t.AlarmId = _t.DOMString;

_t.AlarmRelative = {
    delay:               _t["unsigned long long"],
    period:              _t["unsigned long long"],
    getRemainingSeconds: _t.Function,

    _optional: {
        // nullable
        period:              true,
        getRemainingSeconds: true
    }
};

_t.AlarmAbsolute = {
    date:                 _t.Date,
    period:               _t["unsigned long long"],
    daysOfTheWeek:        [_t.ByDayValue],
    getNextScheduledDate: _t.Function,

    _optional: {
        // nullable
        period:               true,
        getNextScheduledDate: true
    }
};

_t.Alarm = {
    id: _t.AlarmId,

    _optional: {
        // nullable
        id: true
    },

    _derived: [_t.AlarmRelative, _t.AlarmAbsolute]
};

/*
 * Application
 */

_t.ApplicationId                              = _t.DOMString;
_t.ApplicationContextId                       = _t.DOMString;
_t.ApplicationInformationArraySuccessCallback = _t.Function;
_t.FindAppControlSuccessCallback              = _t.Function;
_t.ApplicationContextArraySuccessCallback     = _t.Function;

_t.ApplicationControlData = {
    key:   _t.DOMString,
    value: [_t.DOMString]
};

_t.ApplicationControl = {
    operation: _t.DOMString,
    uri:       _t.DOMString,
    mime:      _t.DOMString,
    category:  _t.DOMString,
    data:      [_t.ApplicationControlData],

    _optional: {
        // nullable
        uri:      true,
        mime:     true,
        category: true
    }
};

_t.ApplicationControlDataArrayReplyCallback = {
    onsuccess: _t.Callback,
    onfailure: _t.Callback
};

_t.ApplicationInformationEventCallback = {
    oninstalled:   _t.Callback,
    onupdated:     _t.Callback,
    onuninstalled: _t.Callback
};

/*
 * Bluetooth
 */

_t.BluetoothAddress                          = _t.DOMString;
_t.BluetoothUUID                             = _t.DOMString;
_t.BluetoothDeviceSuccessCallback            = _t.Function;
_t.BluetoothDeviceArraySuccessCallback       = _t.Function;
_t.BluetoothSocketSuccessCallback            = _t.Function;
_t.BluetoothServiceSuccessCallback           = _t.Function;
_t.BluetoothHealthApplicationSuccessCallback = _t.Function;
_t.BluetoothHealthChannelSuccessCallback     = _t.Function;

_t.BluetoothClass = {
    major:      _t.octet,
    minor:      _t.octet,
    services:   [_t["unsigned short"]],
    hasService: _t.Function
};

_t.BluetoothDevice = {
    name:                   _t.DOMString,
    address:                _t.BluetoothAddress,
    deviceClass:            _t.BluetoothClass,
    isBonded:               _t.boolean,
    isTrusted:              _t.boolean,
    isConnected:            _t.boolean,
    uuids:                  [_t.BluetoothUUID],
    connectToServiceByUUID: _t.Function
};

_t.BluetoothHealthApplication = {
    dataType:   _t["unsigned short"],
    name:       _t.DOMString,
    onconnect:  _t.BluetoothHealthChannelSuccessCallback,
    unregister: _t.Function,

    _optional: {
        onconnect: true
    }
};

_t.BluetoothAdapterChangeCallback = {
    onstatechanged:      _t.Callback,
    onnamechanged:       _t.Callback,
    onvisibilitychanged: _t.Callback
};

_t.BluetoothDiscoverDevicesSuccessCallback = {
    onstarted:           _t.Callback,
    ondevicefound:       _t.Callback,
    ondevicedisappeared: _t.Callback,
    onfinished:          _t.Callback
};

_t.BluetoothHealthChannelChangeCallback = {
    onmessage: _t.Callback,
    onclose:   _t.Callback
};

/*
 * Bookmark
 */

_t.BookmarkFolder = {
    parent: "BookmarkFolder",
    title:  _t.DOMString,

    _optional: {
        // nullable
        parent: true
    }
};

_t.BookmarkItem = {
    parent: _t.BookmarkFolder,
    title:  _t.DOMString,
    url:    _t.DOMString,

    _optional: {
        // nullable
        parent: true
    }
};

_t.Bookmark = {
    _derived: [_t.BookmarkItem, _t.BookmarkFolder]
};

/*
 * Calendar
 */

_t.CalendarChangeCallback = {
    onitemsadded:   _t.Callback,
    onitemsupdated: _t.Callback,
    onitemsremoved: _t.Callback
};

/*
 * CallHistory
 */

_t.CallHistoryEntryArraySuccessCallback = _t.Callback;

_t.RemoteParty = {
    remoteParty: _t.DOMString,
    personId:    _t.PersonId
};

_t.CallHistoryEntry = {
    id:            _t.DOMString,
    type:          _t.DOMString,
    features:      [_t.DOMString],
    remoteParties: [_t.RemoteParty],
    startTime:     _t.Date,
    duration:      _t["unsigned long"],
    direction:     _t.DOMString
};

_t.CallHistoryChangeCallback = {
    onadded:   _t.Callback,
    onchanged: _t.Callback,
    onremoved: _t.Callback
};
/*
 * Contact
 */

_t.AddressBookId  = _t.DOMString;
_t.ContactId      = _t.DOMString;
_t.PersonId       = _t.DOMString;
_t.ContactGroupId = _t.DOMString;

_t.Person = {
    id:               _t.PersonId,
    displayName:      _t.DOMString,
    contactCount:     _t.long,
    hasPhoneNumber:   _t.boolean,
    hasEmail:         _t.boolean,
    isFavorite:       _t.boolean,
    photoURI:         _t.DOMString,
    ringtoneURI:      _t.DOMString,
    displayContactId: _t.ContactId,

    _optional: {
        // nullable
        photoURI:    true,
        ringtoneURI: true
    }
};

_t.ContactRef = {
    addressBookId: _t.AddressBookId,
    contactId:     _t.ContactId
};

_t.ContactName = {
    prefix:            _t.DOMString,
    suffix:            _t.DOMString,
    firstName:         _t.DOMString,
    middleName:        _t.DOMString,
    lastName:          _t.DOMString,
    nicknames:         [_t.DOMString],
    phoneticFirstName: _t.DOMString,
    phoneticLastName:  _t.DOMString,
    displayName:       _t.DOMString,

    _optional: {
        // nullable
        prefix:            true,
        suffix:            true,
        firstName:         true,
        middleName:        true,
        lastName:          true,
        phoneticFirstName: true,
        phoneticLastName:  true,
        displayName:       true
    }
};

_t.ContactOrganization = {
    name:       _t.DOMString,
    department: _t.DOMString,
    title:      _t.DOMString,
    role:       _t.DOMString,
    logoURI:    _t.DOMString,

    _optional: {
        // nullable
        name:       true,
        department: true,
        title:      true,
        role:       true,
        logoURI:    true
    }
};

_t.ContactWebSite = {
    url:  _t.DOMString,
    type: _t.DOMString,

    _optional: {
        // nullable
        type: true
    }
};

_t.ContactAnniversary = {
    date:  _t.Date,
    label: _t.DOMString,

    _optional: {
        // nullable
        label: true
    }
};

_t.ContactAddress = {
    country:               _t.DOMString,
    region:                _t.DOMString,
    city:                  _t.DOMString,
    streetAddress:         _t.DOMString,
    additionalInformation: _t.DOMString,
    postalCode:            _t.DOMString,
    isDefault:             _t.boolean,
    types:                 [_t.DOMString],

    _optional: {
        // nullable
        country:               true,
        region:                true,
        city:                  true,
        streetAddress:         true,
        additionalInformation: true,
        postalCode:            true,
        // undefined
        types:                 true
    }
};

_t.ContactPhoneNumber = {
    number:    _t.DOMString,
    isDefault: _t.boolean,
    types:     [_t.DOMString],

    _optional: {
        // undefined
        types: true
    }
};

_t.ContactEmailAddress = {
    email:     _t.DOMString,
    isDefault: _t.boolean,
    types:     [_t.DOMString],

    _optional: {
        // undefined
        types: true
    }
};

_t.Contact = {
    id:              _t.ContactId,
    personId:        _t.PersonId,
    addressBookId:   _t.AddressBookId,
    lastUpdated:     _t.Date,
    isFavorite:      _t.boolean,
    name:            _t.ContactName,
    addresses:       [_t.ContactAddress],
    photoURI:        _t.DOMString,
    phoneNumbers:    [_t.ContactPhoneNumber],
    emails:          [_t.ContactEmailAddress],
    birthday:        _t.Date,
    anniversaries:   [_t.ContactAnniversary],
    organizations:   [_t.ContactOrganization],
    notes:           [_t.DOMString],
    urls:            [_t.ContactWebSite],
    ringtoneURI:     _t.DOMString,
    groupIds:        [_t.ContactGroupId],
    convertToString: _t.Function,
    clone:           _t.Function,

    _optional: {
        // nullable
        id:            true,
        personId:      true,
        addressBookId: true,
        lastUpdated:   true,
        name:          true,
        photoURI:      true,
        birthday:      true,
        ringtoneURI:   true
    }
};

_t.ContactGroup = {
    id:            _t.ContactGroupId,
    addressBookId: _t.AddressBookId,
    name:          _t.DOMString,
    ringtoneURI:   _t.DOMString,
    photoURI:      _t.DOMString,
    readOnly:      _t.boolean,

    _optional: {
        // nullable
        id:            true,
        addressBookId: true,
        ringtoneURI:   true,
        photoURI:      true
    }
};

_t.PersonArraySuccessCallback      = _t.Function;
_t.ContactArraySuccessCallback     = _t.Function;
_t.AddressBookArraySuccessCallback = _t.Function;

_t.AddressBookChangeCallback = {
    oncontactsadded:   _t.Callback,
    oncontactsupdated: _t.Callback,
    oncontactsremoved: _t.Callback
};

_t.PersonsChangeCallback = {
    onpersonsadded:   _t.Callback,
    onpersonsupdated: _t.Callback,
    onpersonsremoved: _t.Callback
};

_t.ContactInit = {
    name:          _t.ContactName,
    addresses:     [_t.ContactAddress],
    photoURI:      _t.DOMString,
    phoneNumbers:  [_t.ContactPhoneNumber],
    emails:        [_t.ContactEmailAddress],
    birthday:      _t.Date,
    anniversaries: [_t.ContactAnniversary],
    organizations: [_t.ContactOrganization],
    notes:         [_t.DOMString],
    urls:          [_t.ContactWebSite],
    ringtoneURI:   _t.DOMString,
    groupIds:      [_t.ContactGroupId],

    _dictionary: true
};

_t.ContactNameInit = {
    prefix:            _t.DOMString,
    suffix:            _t.DOMString,
    firstName:         _t.DOMString,
    middleName:        _t.DOMString,
    lastName:          _t.DOMString,
    nicknames:         [_t.DOMString],
    phoneticFirstName: _t.DOMString,
    phoneticLastName:  _t.DOMString,

    _dictionary: true
};

_t.ContactOrganizationInit = {
    name:       _t.DOMString,
    department: _t.DOMString,
    title:      _t.DOMString,
    role:       _t.DOMString,
    logoURI:    _t.DOMString,

    _dictionary: true
};

_t.ContactAddressInit = {
    country:               _t.DOMString,
    region:                _t.DOMString,
    city:                  _t.DOMString,
    streetAddress:         _t.DOMString,
    additionalInformation: _t.DOMString,
    postalCode:            _t.DOMString,
    isDefault:             _t.boolean,
    types:                 [_t.DOMString],

    _dictionary: true
};

/*
 * Content
 */

_t.ContentId                            = _t.DOMString;
_t.ContentDirectoryId                   = _t.DOMString;
_t.ContentArraySuccessCallback          = _t.Function;
_t.ContentDirectoryArraySuccessCallback = _t.Function;
_t.ContentScanSuccessCallback           = _t.Function;

_t.ContentChangeCallback = {
    oncontentadded:   _t.Callback,
    oncontentupdated: _t.Callback,
    oncontentremoved: _t.Callback
};

_t.VideoContent = {
    geolocation: _t.SimpleCoordinates,
    album:       _t.DOMString,
    artists:     [_t.DOMString],
    duration:    _t["unsigned long"],
    width:       _t["unsigned long"],
    height:      _t["unsigned long"],

    _optional: {
        // nullable
        geolocation: true,
        album:       true,
        artists:     true
    }
};

_t.AudioContentLyrics = {
    type:       _t.AudioContentLyricsType,
    timestamps: [_t["unsigned long"]],
    texts:      [_t.DOMString]
};

_t.AudioContent = {
    album:       _t.DOMString,
    genres:      [_t.DOMString],
    artists:     [_t.DOMString],
    composers:   [_t.DOMString],
    lyrics:      _t.AudioContentLyrics,
    copyright:   _t.DOMString,
    bitrate:     _t["unsigned long"],
    trackNumber: _t["unsigned short"],
    duration:    _t["unsigned long"],

    _optional: {
        // nullable
        album:       true,
        genres:      true,
        artists:     true,
        composers:   true,
        lyrics:      true,
        copyright:   true,
        trackNumber: true
    }
};

_t.ImageContent = {
    geolocation: _t.SimpleCoordinates,
    width:       _t["unsigned long"],
    height:      _t["unsigned long"],
    orientation: _t.ImageContentOrientation,

    _optional: {
        // nullable
        geolocation: true
    }
};

_t.Content = {
    editableAttributes: [_t.DOMString],
    id:                 _t.ContentId,
    name:               _t.DOMString,
    type:               _t.ContentType,
    mimeType:           _t.DOMString,
    title:              _t.DOMString,
    contentURI:         _t.DOMString,
    thumbnailURIs:      [_t.DOMString],
    releaseDate:        _t.Date,
    modifiedDate:       _t.Date,
    size:               _t["unsigned long"],
    description:        _t.DOMString,
    rating:             _t.float,

    _optional: {
        // nullable
        thumbnailURIs: true,
        releaseDate:   true,
        modifiedDate:  true,
        description:   true
    },

    _derived: [_t.VideoContent, _t.AudioContent, _t.ImageContent]
};

/*
 * Data Control
 */

_t.DataControlSuccessCallback         = _t.Function;
_t.DataControlErrorCallback           = _t.Function;
_t.DataControlInsertSuccessCallback   = _t.Function;
_t.DataControlSelectSuccessCallback   = _t.Function;
_t.DataControlGetValueSuccessCallback = _t.Function;

_t.RowData = {
    columns: [_t.DOMString],
    values:  [_t.DOMString]
};

/*
 * Data Synchronization
 */

_t.SyncProfileId = _t.DOMString;

_t.SyncInfo = {
    url:      _t.DOMString,
    id:       _t.DOMString,
    password: _t.DOMString,
    mode:     _t.SyncMode,
    type:     _t.SyncType,
    interval: _t.SyncInterval,

    _optional: {
        // nullable
        id:       true,
        password: true,
        type:     true,
        interval: true
    }
};

_t.SyncServiceInfo = {
    enable:            _t.boolean,
    serviceType:       _t.SyncServiceType,
    serverDatabaseUri: _t.DOMString,
    id:                _t.DOMString,
    password:          _t.DOMString,

    _optional: {
        // nullable
        id:       true,
        password: true
    }
};

_t.SyncProfileInfo = {
    profileId:   _t.SyncProfileId,
    profileName: _t.DOMString,
    syncInfo:    _t.SyncInfo,
    serviceInfo: [_t.SyncServiceInfo],

    _optional: {
        // nullable
        profileId:   true,
        serviceInfo: true
    }
};

_t.SyncProgressCallback = {
    onprogress:  _t.Callback,
    oncompleted: _t.Callback,
    onstopped:   _t.Callback,
    onfailed:    _t.Callback
};

/*
 * Download
 */

_t.DownloadHTTPHeaderFields = {};

_t.DownloadRequest = {
    url:         _t.DOMString,
    destination: _t.DOMString,
    fileName:    _t.DOMString,
    networkType: _t.DownloadNetworkType,
    httpHeader:  _t.DownloadHTTPHeaderFields,

    _optional: {
        destination: true,
        fileName:    true,
        networkType: true,
        httpHeader:  true
    }
};

_t.DownloadCallback = {
    onprogress:  _t.Callback,
    onpaused:    _t.Callback,
    oncanceled:  _t.Callback,
    oncompleted: _t.Callback,
    onfailed:    _t.Callback
};

/*
 * Messaging
 */

_t.MessageId                               = _t.DOMString;
_t.MessageAttachmentId                     = _t.DOMString;
_t.MessageConvId                           = _t.DOMString;
_t.MessageFolderId                         = _t.DOMString;
_t.MessageServiceArraySuccessCallback      = _t.Function;
_t.MessageRecipientsCallback               = _t.Function;
_t.MessageBodySuccessCallback              = _t.Function;
_t.MessageAttachmentSuccessCallback        = _t.Function;
_t.MessageArraySuccessCallback             = _t.Function;
_t.MessageConversationArraySuccessCallback = _t.Function;
_t.MessageFolderArraySuccessCallback       = _t.Function;

_t.MessageFolder = {
    id:             _t.MessageFolderId,
    parentId:       _t.MessageFolderId,
    serviceId:      _t.DOMString,
    contentType:    _t.MessageServiceTag,
    name:           _t.DOMString,
    path:           _t.DOMString,
    type:           _t.DOMString,
    synchronizable: _t.boolean,

    _optional: {
        // nullable
        parentId: true
    }
};

_t.MessagesChangeCallback = {
    messagesadded:   _t.Callback,
    messagesupdated: _t.Callback,
    messagesremoved: _t.Callback
};

_t.MessageConversationsChangeCallback = {
    conversationsadded:   _t.Callback,
    conversationsupdated: _t.Callback,
    conversationsremoved: _t.Callback
};

_t.MessageFoldersChangeCallback = {
    foldersadded:   _t.Callback,
    foldersupdated: _t.Callback,
    foldersremoved: _t.Callback
};

/*
 * Network Bearer Selection
 */

_t.NetworkSuccessCallback = {
    onsuccess:      _t.Callback,
    ondisconnected: _t.Callback
};

/*
 * NFC
 */

_t.NDEFMessageReadCallback  = _t.Function;
_t.ByteArraySuccessCallback = _t.Function;

_t.NFCTagDetectCallback = {
    onattach: _t.Callback,
    ondetach: _t.Callback
};

_t.NFCPeerDetectCallback = {
    onattach: _t.Callback,
    ondetach: _t.Callback
};

_t.NDEFRecordText = {
    text:         _t.DOMString,
    languageCode: _t.DOMString,
    encoding:     _t.NDEFRecordTextEncoding
};

_t.NDEFRecordURI = {
    uri: _t.DOMString
};

_t.NDEFRecordMedia = {
    mimeType: _t.DOMString
};

_t.NDEFRecord = {
    tnf:     _t.short,
    type:    [_t.byte],
    id:      [_t.byte],
    payload: [_t.byte],

    _derived: [_t.NDEFRecordText, _t.NDEFRecordURI, _t.NDEFRecordMedia]
};

_t.NDEFMessage = {
    recordCount: _t.long,
    records:     [_t.NDEFRecord],
    toByte:      _t.Function
};

/*
 * Notification
 */

_t.NotificationId = _t.DOMString;

_t.NotificationDetailInfo = {
    mainText: _t.DOMString,
    subText:  _t.DOMString,

    _optional: {
        // nullable
        subText: true
    }
};

_t.StatusNotificationInit = {
    content:             _t.DOMString,
    iconPath:            _t.DOMString,
    soundPath:           _t.DOMString,
    vibration:           _t.boolean,
    appControl:          _t.ApplicationControl,
    appId:               _t.ApplicationId,
    progressType:        _t.NotificationProgressType,
    progressValue:       _t["unsigned long"],
    number:              _t.long,
    subIconPath:         _t.DOMString,
    detailInfo:          [_t.NotificationDetailInfo],
    ledColor:            _t.DOMString,
    ledOnPeriod:         _t["unsigned long"],
    ledOffPeriod:        _t["unsigned long"],
    backgroundImagePath: _t.DOMString,
    thumbnails:          [_t.DOMString],

    _dictionary: true
};

_t.StatusNotification = {
    statusType:          _t.StatusNotificationType,
    iconPath:            _t.DOMString,
    subIconPath:         _t.DOMString,
    number:              _t.long,
    detailInfo:          [_t.NotificationDetailInfo],
    ledColor:            _t.DOMString,
    ledOnPeriod:         _t["unsigned long"],
    ledOffPeriod:        _t["unsigned long"],
    backgroundImagePath: _t.DOMString,
    thumbnails:          [_t.DOMString],
    soundPath:           _t.DOMString,
    vibration:           _t.boolean,
    appControl:          _t.ApplicationControl,
    appId:               _t.ApplicationId,
    progressType:        _t.NotificationProgressType,
    progressValue:       _t["unsigned long"],

    _optional: {
        // nullable
        iconPath:            true,
        subIconPath:         true,
        number:              true,
        detailInfo:          true,
        ledColor:            true,
        backgroundImagePath: true,
        thumbnails:          true,
        soundPath:           true,
        appControl:          true,
        appId:               true,
        progressValue:       true
    }
};

_t.Notification = {
    id:         _t.NotificationId,
    type:       _t.NotificationType,
    postedTime: _t.Date,
    title:      _t.DOMString,
    content:    _t.DOMString,

    _optional: {
        // nullable
        id:         true,
        postedTime: true,
        content:    true
    },

    _derived: [_t.StatusNotification]
};

/*
 * Push
 */

_t.PushRegistrationId          = _t.DOMString;
_t.PushRegisterSuccessCallback = _t.Function;
_t.PushNotificationCallback    = _t.Function;

/*
 * Package
 */

_t.PackageId = _t.DOMString;
_t.PackageInformationArraySuccessCallback = _t.Function;

_t.PackageProgressCallback = {
    onprogress: _t.Callback,
    oncomplete: _t.Callback
};

_t.PackageInfomationEventCallback = {
    oninstalled:   _t.Callback,
    onupdated:     _t.Callback,
    onuninstalled: _t.Callback
};

/*
 * System Info
 */

_t.SystemInfoPropertySuccessCallback = _t.Callback;

_t.SystemInfoOptions = {
    timeout:       _t["unsigned long"],
    highThreshold: _t.double,
    lowThreshold:  _t.double,

    _dictionary: true
};

/*
 * System Setting
 */

_t.SystemSettingSuccessCallback = _t.Function;

/*
 * Constructor list definition
 */

/*
 * Generic constructor
 *     Construct a prototype of constructor. A fake array of arguments type is
 *     specified for constructor.
 *
 * Overloaded constructors
 *     Construct an array of prototype of constructor. Each array element is
 *     specified for one of constructors. The constructor with extra arguments
 *     are recommended to be defined ahead of the one with fewer same arguments
 *     for exact match.
 */

_c = {
    // Alarm
    AlarmAbsolute: [],

    // Contact
    Contact:       [],

    // NFC
    NDEFMessage:   [],
    NDEFRecord:    [],

    // Data Synchronization
    SyncInfo:      []
};

/*
 * Common
 */

// AttributeFilter
_c.AttributeFilter = {
    0: _t.DOMString,
    1: _t.FilterMatchFlag,
    2: _t.any,

    _optional: {
        1: true,
        2: true
    }
};

// AttributeRangeFilter
_c.AttributeRangeFilter = {
    0: _t.DOMString,
    1: _t.any,
    2: _t.any,

    _optional: {
        1: true,
        2: true
    }
};

// CompositeFilter
_c.CompositeFilter = {
    0: _t.CompositeFilterType,
    1: [_t.AbstractFilter],

    _optional: {
        1: true
    }
};

// SortMode
_c.SortMode = {
    0: _t.DOMString,
    1: _t.SortModeOrder,

    _optional: {
        1: true
    }
};

// SimpleCoordinates
_c.SimpleCoordinates = {
    0: _t.double,
    1: _t.double
};

// TimeDuration
_c.TimeDuration = {
    0: _t["unsigned long long"],
    1: _t.TimeDurationUnit,

    _optional: {
        1: true
    }
};

/*
 * Alarm
 */

// AlarmRelative
_c.AlarmRelative = {
    0: _t.long,
    1: _t.long,

    _optional: {
        1: true
    }
};

// AlarmAbsolute
_c.AlarmAbsolute[0] = {
    0: _t.Date,
    1: [_t.ByDayValue]
};

_c.AlarmAbsolute[1] = {
    0: _t.Date,
    1: _t.long
};

_c.AlarmAbsolute[2] = {
    0: _t.Date
};

/*
 * Application
 */

// ApplicationControlData
_c.ApplicationControlData = {
    0: _t.DOMString,
    1: [_t.DOMString]
};

// ApplicationControl
_c.ApplicationControl = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.DOMString,
    4: [_t.ApplicationControlData],

    _optional: {
        1: true,
        2: true,
        3: true,
        4: true
    }
};

/*
 * Bookmark
 */

// BookmarkItem
_c.BookmarkItem = {
    0: _t.DOMString,
    1: _t.DOMString
};

// BookmarkFolder
_c.BookmarkFolder = {
    0: _t.DOMString
};

/*
 * Contact
 */

// Contact
_c.Contact[0] = {
    0: _t.ContactInit,

    _optional: {
        0: true
    }
};

_c.Contact[1] = {
    0: _t.DOMString
};

// ContactRef
_c.ContactRef = {
    0: _t.AddressBookId,
    1: _t.ContactId
};

// ContactName
_c.ContactName = {
    0: _t.ContactNameInit,

    _optional: {
        0: true
    }
};

// ContactOrganization
_c.ContactOrganization = {
    0: _t.ContactOrganizationInit,

    _optional: {
        0: true
    }
};

// ContactWebSite
_c.ContactWebSite = {
    0: _t.DOMString,
    1: _t.DOMString,

    _optional: {
        1: true
    }
};

// ContactAnniversary
_c.ContactAnniversary = {
    0: _t.Date,
    1: _t.DOMString,

    _optional: {
        1: true
    }
};

// ContactAddress
_c.ContactAddress = {
    0: _t.ContactAddressInit,

    _optional: {
        0: true
    }
};

// ContactPhoneNumber
_c.ContactPhoneNumber = {
    0: _t.DOMString,
    1: [_t.DOMString],
    2: _t.boolean,

    _optional: {
        1: true,
        2: true
    }
};

// ContactEmailAddress
_c.ContactEmailAddress = {
    0: _t.DOMString,
    1: [_t.DOMString],
    2: _t.boolean,

    _optional: {
        1: true,
        2: true
    }
};

// ContactGroup
_c.ContactGroup = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,

    _optional: {
        1: true,
        2: true
    }
};

/*
 * Data Synchronization
 */

// SyncInfo
_c.SyncInfo[0] = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.SyncMode,
    4: _t.SyncType
};

_c.SyncInfo[1] = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.SyncMode,
    4: _t.SyncInterval
};

_c.SyncInfo[2] = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.SyncMode
};

// SyncServiceInfo
_c.SyncServiceInfo = {
    0: _t.boolean,
    1: _t.SyncServiceType,
    2: _t.DOMString,
    3: _t.DOMString,
    4: _t.DOMString,

    _optional: {
        3: true,
        4: true
    }
};

// SyncProfileInfo
_c.SyncProfileInfo = {
    0: _t.DOMString,
    1: _t.SyncInfo,
    2: [_t.SyncServiceInfo],

    _optional: {
        2: true
    }
};

/*
 * Download
 */

// DownloadRequest
_c.DownloadRequest = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.DownloadNetworkType,
    4: _t.DownloadHTTPHeaderFields,

    _optional: {
        1: true,
        2: true,
        3: true,
        4: true
    }
};

/*
 * NFC
 */

// NDEFMessage
_c.NDEFMessage[0] = {
    0: [_t.NDEFRecord]
};

_c.NDEFMessage[1] = {
    0: [_t.byte]
};

_c.NDEFMessage[2] = null;

// NDEFRecord
_c.NDEFRecord[0] = {
    0: _t.short,
    1: [_t.byte],
    2: [_t.byte],
    3: [_t.byte],

    _optional: {
        3: true
    }
};

_c.NDEFRecord[1] = {
    0: [_t.byte]
};

// NDEFRecordText
_c.NDEFRecordText = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DOMString,

    _optional: {
        2: true
    }
};

// NDEFRecordURI
_c.NDEFRecordURI = {
    0: _t.DOMString
};

// NDEFRecordMedia
_c.NDEFRecordMedia = {
    0: _t.DOMString,
    1: [_t.byte]
};

/*
 * Notification
 */

// StatusNotification
_c.StatusNotification = {
    0: _t.StatusNotificationType,
    1: _t.DOMString,
    2: _t.StatusNotificationInit,

    _optional: {
        2: true
    }
};

// NotificationDetailInfo
_c.NotificationDetailInfo = {
    0: _t.DOMString,
    1: _t.DOMString,

    _optional: {
        1: true
    }
};

/*
 * Interface prototype definition
 */

_i = {
    // Alarm
    AlarmManager:                  {},

    // Application
    ApplicationManager:            {},
    Application:                   {},
    RequestedApplicationControl:   {},

    // Bluetooth
    BluetoothManager:              {},
    BluetoothAdapter:              {},
    BluetoothDevice:               {},
    BluetoothSocket:               {},
    BluetoothClass:                {},
    BluetoothServiceHandler:       {},
    BluetoothHealthProfileHandler: {},
    BluetoothHealthApplication:    {},
    BluetoothHealthChannel:        {},

    // Bookmark
    BookmarkManager:               {},

    // CallHistory
    CallHistory:                    {},

    // Contact
    ContactManager:                {},
    AddressBook:                   {},
    Person:                        {},
    Contact:                       {},

    // Content
    ContentManager:                {},

    // Data Control
    DataControlManager:            {},
    SQLDataControlConsumer:        {},
    MappedDataControlConsumer:     {},

    // Data Synchronization
    DataSynchronizationManager:    {},

    // Download
    DownloadManager:               {},

    // Network Bearer Selection
    NetworkBearerSelection:        {},

    // NFC
    NFCManager:                    {},
    NFCAdapter:                    {},
    NFCTag:                        {},
    NFCPeer:                       {},
    NDEFMessage:                   {},

    // Notification
    NotificationManager:           {},

    // Message
    Messaging:                     {},
    MessageService:                {},
    MessageStorage:                {},

    // Package
    PackageManager:                {},

    // Push
    PushManager:                   {},

    // System Info
    SystemInfo:                    {},

    // System Setting
    SystemSettingManager:          {},

    // Time
    TimeUtil:                      {},
    TZDate:                        {},
    TimeDuration:                  {}
};

/*
 * Alarm
 */

// AlarmManager
_i.AlarmManager.add = {
    0: _t.Alarm,
    1: _t.ApplicationId,
    2: _t.ApplicationControl,

    _optional: {
        2: true
    }
};

_i.AlarmManager.remove = {
    0: _t.AlarmId
};

_i.AlarmManager.removeAll = null;

_i.AlarmManager.get = {
    0: _t.AlarmId
};

_i.AlarmManager.getAll = null;

/*
 * Application
 */

// ApplicationManager
_i.ApplicationManager.getCurrentApplication = null;

_i.ApplicationManager.kill = {
    0: _t.ApplicationContextId,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ApplicationManager.launch = {
    0: _t.ApplicationId,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ApplicationManager.launchAppControl = {
    0: _t.ApplicationControl,
    1: _t.ApplicationId,
    2: _t.SuccessCallback,
    3: _t.ErrorCallback,
    4: _t.ApplicationControlDataArrayReplyCallback,

    _optional: {
        1: true,
        2: true,
        3: true,
        4: true
    }
};

_i.ApplicationManager.findAppControl = {
    0: _t.ApplicationControl,
    1: _t.FindAppControlSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.ApplicationManager.getAppsContext = {
    0: _t.ApplicationContextArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.ApplicationManager.getAppContext = {
    0: _t.ApplicationContextId,

    _optional: {
        0: true
    }
};

_i.ApplicationManager.getAppsInfo = {
    0: _t.ApplicationInformationArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.ApplicationManager.getAppInfo = {
    0: _t.ApplicationId,

    _optional: {
        0: true
    }
};

_i.ApplicationManager.getAppCerts = {
    0: _t.ApplicationId,

    _optional: {
        0: true
    }
};

_i.ApplicationManager.getAppSharedURI = {
    0: _t.ApplicationId,

    _optional: {
        0: true
    }
};

_i.ApplicationManager.getAppMetaData = {
    0: _t.ApplicationId,

    _optional: {
        0: true
    }
};

_i.ApplicationManager.addAppInfoEventListener = {
    0: _t.ApplicationInformationEventCallback
};

_i.ApplicationManager.removeAppInfoEventListener = {
    0: _t.long
};

// Application
_i.Application.exit = null;
_i.Application.hide = null;
_i.Application.getRequestedAppControl = null;

// RequestedApplicationControl
_i.RequestedApplicationControl.replyResult = {
    0: [_t.ApplicationControlData],

    _optional: {
        0: true
    }
};

_i.RequestedApplicationControl.replyFailure = null;

/*
 * Bluetooth
 */

// BluetoothManager
_i.BluetoothManager.getDefaultAdapter = null;

// BluetoothAdapter
_i.BluetoothAdapter.setName = {
    0: _t.DOMString,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.BluetoothAdapter.setPowered = {
    0: _t.boolean,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.BluetoothAdapter.setVisible = {
    0: _t.boolean,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,
    3: _t["unsigned short"],

    _optional: {
        1: true,
        2: true,
        3: true
    }
};

_i.BluetoothAdapter.setChangeListener = {
    0: _t.BluetoothAdapterChangeCallback
};

_i.BluetoothAdapter.unsetChangeListener = null;

_i.BluetoothAdapter.discoverDevices = {
    0: _t.BluetoothDiscoverDevicesSuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.BluetoothAdapter.stopDiscovery = {
    0: _t.SuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        0: true,
        1: true
    }
};

_i.BluetoothAdapter.getKnownDevices = {
    0: _t.BluetoothDeviceArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.BluetoothAdapter.getDevice = {
    0: _t.BluetoothAddress,
    1: _t.BluetoothDeviceSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.BluetoothAdapter.createBonding = {
    0: _t.BluetoothAddress,
    1: _t.BluetoothDeviceSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.BluetoothAdapter.destroyBonding = {
    0: _t.BluetoothAddress,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.BluetoothAdapter.registerRFCOMMServiceByUUID = {
    0: _t.BluetoothUUID,
    1: _t.DOMString,
    2: _t.BluetoothServiceSuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

_i.BluetoothAdapter.getBluetoothProfileHandler = {
    0: _t.BluetoothProfileType
};

// BluetoothDevice
_i.BluetoothDevice.connectToServiceByUUID = {
    0: _t.BluetoothUUID,
    1: _t.BluetoothSocketSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

// BluetoothSocket
_i.BluetoothSocket.readData = null;
_i.BluetoothSocket.close = null;

_i.BluetoothSocket.writeData = {
    0: [_t.byte]
};

// BluetoothClass
_i.BluetoothClass.hasService = {
    0: _t["unsigned short"]
};

// BluetoothServiceHandler
_i.BluetoothServiceHandler.unregister = {
    0: _t.SuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        0: true,
        1: true
    }
};

// BluetoothHealthProfileHandler
_i.BluetoothHealthProfileHandler.registerSinkApplication = {
    0: _t["unsigned short"],
    1: _t.DOMString,
    2: _t.BluetoothHealthApplicationSuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

_i.BluetoothHealthProfileHandler.connectToSource = {
    0: _t.BluetoothDevice,
    1: _t.BluetoothHealthApplication,
    2: _t.BluetoothHealthChannelSuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

// BluetoothHealthApplication
_i.BluetoothHealthApplication.unregister = {
    0: _t.SuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        0: true,
        1: true
    }
};

// BluetoothHealthChannel
_i.BluetoothHealthChannel.close = null;
_i.BluetoothHealthChannel.unsetListener = null;

_i.BluetoothHealthChannel.sendData = {
    0: [_t.byte]
};

_i.BluetoothHealthChannel.setListener = {
    0: _t.BluetoothHealthChannelChangeCallback
};

/*
 * Bookmark
 */

// BookmarkManager
_i.BookmarkManager.get = {
    0: _t.BookmarkFolder,
    1: _t.boolean,

    _optional: {
        0: true,
        1: true
    }
};

_i.BookmarkManager.add = {
    0: _t.Bookmark,
    1: _t.BookmarkFolder,

    _optional: {
        1: true
    }
};

_i.BookmarkManager.remove = {
    0: _t.Bookmark,

    _optional: {
        0: true
    }
};

/*
 * CallHistory
 */

// CallHistory
_i.CallHistory.find = {
    0: _t.CallHistoryEntryArraySuccessCallback,
    1: _t.ErrorCallback,
    2: _t.AbstractFilter,
    3: _t.SortMode,
    4: _t["unsigned long"],
    5: _t["unsigned long"],

    _optional: {
        1: true,
        2: true,
        3: true,
        4: true,
        5: true
    }
};

_i.CallHistory.remove = {
    0: _t.CallHistoryEntry
};

_i.CallHistory.removeBatch = {
    0: [_t.CallHistoryEntry],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.CallHistory.removeAll = {
    0: _t.SuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        0: true,
        1: true
    }
};

_i.CallHistory.addChangeListener = {
    0: _t.CallHistoryChangeCallback
};

_i.CallHistory.removeChangeListener = {
    0: _t.long
};

/*
 * Contact
 */

// ContactManager
_i.ContactManager.getAddressBooks = {
    0: _t.AddressBookArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.ContactManager.getUnifiedAddressBook = null;
_i.ContactManager.getDefaultAddressBook = null;

_i.ContactManager.getAddressBook = {
    0: _t.AddressBookId
};

_i.ContactManager.get = {
    0: _t.PersonId
};

_i.ContactManager.update = {
    0: _t.Person
};

_i.ContactManager.updateBatch = {
    0: [_t.Person],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ContactManager.remove = {
    0: _t.PersonId
};

_i.ContactManager.removeBatch = {
    0: [_t.PersonId],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ContactManager.find = {
    0: _t.PersonArraySuccessCallback,
    1: _t.ErrorCallback,
    2: _t.AbstractFilter,
    3: _t.SortMode,

    _optional: {
        1: true,
        2: true,
        3: true
    }
};

_i.ContactManager.addChangeListener = {
    0: _t.PersonsChangeCallback
};

_i.ContactManager.removeChangeListener = {
    0: _t.long
};

// AddressBook
_i.AddressBook.get = {
    0: _t.ContactId
};

_i.AddressBook.add = {
    0: _t.Contact
};

_i.AddressBook.addBatch = {
    0: [_t.Contact],
    1: _t.ContactArraySuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.AddressBook.update = {
    0: _t.Contact
};

_i.AddressBook.updateBatch = {
    0: [_t.Contact],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.AddressBook.remove = {
    0: _t.ContactId
};

_i.AddressBook.removeBatch = {
    0: [_t.ContactId],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.AddressBook.find = {
    0: _t.ContactArraySuccessCallback,
    1: _t.ErrorCallback,
    2: _t.AbstractFilter,
    3: _t.SortMode,

    _optional:{
        1: true,
        2: true,
        3: true
    }
};

_i.AddressBook.addChangeListener = {
    0: _t.AddressBookChangeCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.AddressBook.removeChangeListener = {
    0: _t.long
};

_i.AddressBook.getGroup = {
    0: _t.ContactGroupId
};

_i.AddressBook.addGroup = {
    0: _t.ContactGroup
};

_i.AddressBook.updateGroup = {
    0: _t.ContactGroup
};

_i.AddressBook.removeGroup = {
    0: _t.ContactGroupId
};

_i.AddressBook.getGroups = null;

// Person
_i.Person.link = {
    0: _t.PersonId
};

_i.Person.unlink = {
    0: _t.ContactId
};

// Contact
_i.Contact.convertToString = {
    0: _t.ContactTextFormat,

    _optional: {
        0: true
    }
};

_i.Contact.clone = null;

/*
 * Content
 */

// ContentManager
_i.ContentManager.update = {
    0: _t.Content
};

_i.ContentManager.updateBatch = {
    0: [_t.Content],
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ContentManager.getDirectories = {
    0: _t.ContentDirectoryArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.ContentManager.find = {
    0: _t.ContentArraySuccessCallback,
    1: _t.ErrorCallback,
    2: _t.ContentDirectoryId,
    3: _t.AbstractFilter,
    4: _t.SortMode,
    5: _t["unsigned long"],
    6: _t["unsigned long"],

    _optional: {
        1: true,
        2: true,
        3: true,
        4: true,
        5: true,
        6: true
    }
};

_i.ContentManager.scanFile = {
    0: _t.DOMString,
    1: _t.ContentScanSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.ContentManager.setChangeListener = {
    0: _t.ContentChangeCallback
};

_i.ContentManager.unsetChangeListener = null;

/*
 * Data Control
 */

// DataControlManager
_i.DataControlManager.getDataControlConsumer = {
    0: _t.DOMString,
    1: _t.DOMString,
    2: _t.DataType
};

// SQLDataControlConsumer
_i.SQLDataControlConsumer.insert = {
    0: _t["unsigned long"],
    1: _t.RowData,
    2: _t.DataControlInsertSuccessCallback,
    3: _t.DataControlErrorCallback,

    _optional: {
        2: true,
        3: true
    }
};

_i.SQLDataControlConsumer.update = {
    0: _t["unsigned long"],
    1: _t.RowData,
    2: _t.DOMString,
    3: _t.DataControlSuccessCallback,
    4: _t.DataControlErrorCallback,

    _optional: {
        3: true,
        4: true
    }
};

_i.SQLDataControlConsumer.remove = {
    0: _t["unsigned long"],
    1: _t.DOMString,
    2: _t.DataControlSuccessCallback,
    3: _t.DataControlErrorCallback,

    _optional: {
        2: true,
        3: true
    }
};

_i.SQLDataControlConsumer.select = {
    0: _t["unsigned long"],
    1: [_t.DOMString],
    2: _t.DOMString,
    3: _t.DataControlSelectSuccessCallback,
    4: _t.DataControlErrorCallback,
    5: _t["unsigned long"],
    6: _t["unsigned long"],

    _optional: {
        4: true,
        5: true,
        6: true
    }
};

// MappedDataControlConsumer
_i.MappedDataControlConsumer.addValue = {
    0: _t["unsigned long"],
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.DataControlSuccessCallback,
    4: _t.DataControlErrorCallback,

    _optional: {
        3: true,
        4: true
    }
};

_i.MappedDataControlConsumer.removeValue = {
    0: _t["unsigned long"],
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.DataControlSuccessCallback,
    4: _t.DataControlErrorCallback,

    _optional: {
        4: true
    }
};

_i.MappedDataControlConsumer.getValue = {
    0: _t["unsigned long"],
    1: _t.DOMString,
    2: _t.DataControlGetValueSuccessCallback,
    3: _t.DataControlErrorCallback,

    _optional: {
        3: true
    }
};

_i.MappedDataControlConsumer.updateValue = {
    0: _t["unsigned long"],
    1: _t.DOMString,
    2: _t.DOMString,
    3: _t.DOMString,
    4: _t.DataControlSuccessCallback,
    5: _t.DataControlErrorCallback,

    _optional: {
        5: true
    }
};

/*
 * Data Synchronization
 */

// DataSynchronizationManager
_i.DataSynchronizationManager.getMaxProfilesNum = null;
_i.DataSynchronizationManager.getProfilesNum    = null;
_i.DataSynchronizationManager.getAll            = null;

_i.DataSynchronizationManager.add = {
    0: _t.SyncProfileInfo
};

_i.DataSynchronizationManager.update = {
    0: _t.SyncProfileInfo
};

_i.DataSynchronizationManager.remove = {
    0: _t.SyncProfileId
};

_i.DataSynchronizationManager.get = {
    0: _t.SyncProfileId
};

_i.DataSynchronizationManager.startSync = {
    0: _t.SyncProfileId,
    1: _t.SyncProgressCallback,

    _optional: {
        1: true
    }
};

_i.DataSynchronizationManager.stopSync = {
    0: _t.SyncProfileId
};

_i.DataSynchronizationManager.getLastSyncStatistics = {
    0: _t.SyncProfileId
};

/*
 * Download
 */

// DownloadManager
_i.DownloadManager.start = {
    0: _t.DownloadRequest,
    1: _t.DownloadCallback,

    _optional: {
        1: true
    }
};

_i.DownloadManager.cancel = {
    0: _t.long
};

_i.DownloadManager.pause = {
    0: _t.long
};

_i.DownloadManager.resume = {
    0: _t.long
};

_i.DownloadManager.getState = {
    0: _t.long
};

_i.DownloadManager.getDownloadRequest = {
    0: _t.long
};

_i.DownloadManager.getMIMEType = {
    0: _t.long
};

_i.DownloadManager.setListener = {
    0: _t.long,
    1: _t.DownloadCallback
};

/*
 * Network Bearer Selection
 */

// NetworkBearerSelection
_i.NetworkBearerSelection.requestRouteToHost = {
    0: _t.NetworkType,
    1: _t.DOMString,
    2: _t.NetworkSuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

_i.NetworkBearerSelection.releaseRouteToHost = {
    0: _t.NetworkType,
    1: _t.DOMString,
    2: _t.SuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

/*
 * NFC
 */

// NFCManager
_i.NFCManager.getDefaultAdapter = null;
_i.NFCManager.setExclusiveMode = {
    0: _t.boolean
};

// NFCAdapter
_i.NFCAdapter.setPowered = {
    0: _t.boolean,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.NFCAdapter.setTagListener = {
    0: _t.NFCTagDetectCallback,
    1: [_t.NFCTagType],

    _optional: {
        1: true
    }
};

_i.NFCAdapter.setPeerListener = {
    0: _t.NFCPeerDetectCallback
};

_i.NFCAdapter.unsetTagListener  = null;
_i.NFCAdapter.unsetPeerListener = null;
_i.NFCAdapter.getCachedMessage  = null;

// NFCTag
_i.NFCTag.readNDEF = {
    0: _t.NDEFMessageReadCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.NFCTag.writeNDEF = {
    0: _t.NDEFMessage,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

_i.NFCTag.transceive = {
    0: [_t.byte],
    1: _t.ByteArraySuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

// NFCPeer
_i.NFCPeer.setReceiveNDEFListener = {
    0: _t.NDEFMessageReadCallback
};

_i.NFCPeer.unsetReceiveNDEFListener = null;

_i.NFCPeer.sendNDEF = {
    0: _t.NDEFMessage,
    1: _t.SuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        1: true,
        2: true
    }
};

// NDEFMessage
_i.NDEFMessage.toByte = null;

/*
 * Notification
 */

// NotificationManager
_i.NotificationManager.post = {
    0: _t.Notification
};

_i.NotificationManager.update = {
    0: _t.Notification
};

_i.NotificationManager.remove = {
    0: _t.NotificationId
};

_i.NotificationManager.get = {
    0: _t.NotificationId
};

_i.NotificationManager.removeAll = null;
_i.NotificationManager.getAll = null;

/*
 * Package
 */

// PackageManager
_i.PackageManager.install = {
    0: _t.DOMString,
    1: _t.PackageProgressCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.PackageManager.uninstall = {
    0: _t.PackageId,
    1: _t.PackageProgressCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.PackageManager.getPackagesInfo = {
    0: _t.PackageInformationArraySuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        1: true
    }
};

_i.PackageManager.getPackageInfo = {
    0: _t.PackageId,

    _optional: {
        0: true
    }
};

_i.PackageManager.setPackageInfoEventListener = {
    0: _t.PackageInfomationEventCallback
};

_i.PackageManager.unsetPackageInfoEventListener = null;

/*
 * Push
 */

// PushManager
_i.PushManager.registerService = {
    0: _t.ApplicationControl,
    1: _t.PushRegisterSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.PushManager.unregisterService = {
    0: _t.SuccessCallback,
    1: _t.ErrorCallback,

    _optional: {
        0: true,
        1: true
    }
};

_i.PushManager.connectService = {
    0: _t.PushNotificationCallback
};

_i.PushManager.disconnectService = null;
_i.PushManager.getRegistrationId = null;

/*
 * System Info
 */

// SystemInfo
_i.SystemInfo.getCapabilities = null;

_i.SystemInfo.getPropertyValue = {
    0: _t.SystemInfoPropertyId,
    1: _t.SystemInfoPropertySuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

_i.SystemInfo.addPropertyValueChangeListener = {
    0: _t.SystemInfoPropertyId,
    1: _t.SystemInfoPropertySuccessCallback,
    2: _t.SystemInfoOptions,

    _optional: {
        2: true
    }
};

_i.SystemInfo.removePropertyValueChangeListener = {
    0: _t["unsigned long"]
};

/*
 * System Setting
 */

// SystemSettingManager
_i.SystemSettingManager.setProperty = {
    0: _t.SystemSettingType,
    1: _t.DOMString,
    2: _t.SuccessCallback,
    3: _t.ErrorCallback,

    _optional: {
        3: true
    }
};

_i.SystemSettingManager.getProperty = {
    0: _t.SystemSettingType,
    1: _t.SystemSettingSuccessCallback,
    2: _t.ErrorCallback,

    _optional: {
        2: true
    }
};

/*
 * Time
 */

// TimeUtil
_i.TimeUtil.getCurrentDateTime = null;
_i.TimeUtil.getLocalTimezone = null;
_i.TimeUtil.getAvailableTimezones = null;
_i.TimeUtil.getDateFormat = {
    0: _t.boolean,

    _optional: {
        0: true
    }
};

_i.TimeUtil.getTimeFormat = null;
_i.TimeUtil.isLeapYear = {
    0: _t.long
};

// TimeDuration
_i.TimeDuration.difference = {
    0: _t.TimeDuration
};

_i.TimeDuration.equalsTo = {
    0: _t.TimeDuration
};

_i.TimeDuration.lessThan = {
    0: _t.TimeDuration
};

_i.TimeDuration.greaterThan = {
    0: _t.TimeDuration
};

// Exports
_t.constructor = _c;
_t.interface   = _i;

module.exports = _t;
});
define.unordered = true;
define('ripple/platform/tizen/2.0/errorcode', function (require, exports, module) {
/*
 *  Copyright 2011 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"),
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _self = {};

_self.__defineGetter__("UNKNOWN_ERR", function () {
    return 0;
});

_self.__defineGetter__("INDEX_SIZE_ERR", function () {
    return 1;
});

_self.__defineGetter__("DOMSTRING_SIZE_ERR", function () {
    return 2;
});

_self.__defineGetter__("HIERARCHY_REQUEST_ERR", function () {
    return 3;
});

_self.__defineGetter__("WRONG_DOCUMENT_ERR", function () {
    return 4;
});

_self.__defineGetter__("INVALID_CHARACTER_ERR", function () {
    return 5;
});

_self.__defineGetter__("NO_DATA_ALLOWED_ERR", function () {
    return 6;
});

_self.__defineGetter__("NO_MODIFICATION_ALLOWED_ERR", function () {
    return 7;
});

_self.__defineGetter__("NOT_FOUND_ERR", function () {
    return 8;
});

_self.__defineGetter__("NOT_SUPPORTED_ERR", function () {
    return 9;
});

_self.__defineGetter__("INUSE_ATTRIBUTE_ERR", function () {
    return 10;
});

_self.__defineGetter__("INVALID_STATE_ERR", function () {
    return 11;
});

_self.__defineGetter__("SYNTAX_ERR", function () {
    return 12;
});

_self.__defineGetter__("INVALID_MODIFICATION_ERR", function () {
    return 13;
});

_self.__defineGetter__("NAMESPACE_ERR", function () {
    return 14;
});

_self.__defineGetter__("INVALID_ACCESS_ERR", function () {
    return 15;
});

_self.__defineGetter__("VALIDATION_ERR", function () {
    return 16;
});

_self.__defineGetter__("TYPE_MISMATCH_ERR", function () {
    return 17;
});

_self.__defineGetter__("SECURITY_ERR", function () {
    return 18;
});

_self.__defineGetter__("NETWORK_ERR", function () {
    return 19;
});

_self.__defineGetter__("ABORT_ERR", function () {
    return 20;
});

_self.__defineGetter__("URL_MISMATCH_ERR", function () {
    return 21;
});

_self.__defineGetter__("QUOTA_EXCEEDED_ERR", function () {
    return 22;
});

_self.__defineGetter__("TIMEOUT_ERR", function () {
    return 23;
});

_self.__defineGetter__("INVALID_NODE_TYPE_ERR", function () {
    return 24;
});

_self.__defineGetter__("DATA_CLONE_ERR", function () {
    return 25;
});

_self.__defineGetter__("INVALID_VALUES_ERR", function () {
    return 99;
});

_self.__defineGetter__("IO_ERR", function () {
    return 100;
});

_self.__defineGetter__("SERVICE_NOT_AVAILABLE_ERR", function () {
    return 111;
});

module.exports = _self;

});
define.unordered = true;
define('ripple/platform/tizen/2.0/WebAPIError', function (require, exports, module) {
/*
 *  Copyright 2012 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var errorcode = require('ripple/platform/tizen/2.0/errorcode');

var msg = {
    0: "Generic Error",
    1: "Index or size is negative, or greater than the allowed value.",
    2: "Specified range of text does not fit into a DOMString.",
    3: "Node is inserted somewhere it doesn't belong.",
    4: "Node is used in a different document than the one that created it (that doesn't support it).",
    5: "An invalid or illegal character is specified.",
    6: "Data is specified for a Node which does not support data.",
    7: "An attempt is made to modify an object where modifications are not allowed.",
    8: "An attempt is made to reference a Node in a context where it does not exist.",
    9: "The implementation does not support the requested type of object or operation.",
    10: "An attempt is made to add an attribute that is already in use elsewhere.",
    11: "An attempt is made to use an object that is not, or is no longer, usable.",
    12: "An invalid or illegal string is specified.",
    13: "An attempt is made to modify the type of the underlying object.",
    14: "An attempt is made to create or change an object in a way which is incorrect with regard to namespaces.",
    15: "A parameter or an operation is not supported by the underlying object.",
    16: "A call to a method such as insertBefore or removeChild would make the Node invalid with respect to \"partial validity\", this exception would be raised and the operation would not be done.",
    17: "The type of an object is incompatible with the expected type of the parameter associated to the object.",
    18: "An attempt is made to perform an operation or access some data in a way that would be a security risk or a violation of the user agent's security policy.",
    19: "A network error occurs in synchronous requests.",
    20: "The abort error occurs in asynchronous requests by user prompt.",
    21: "The operation could not be completed because the URL does not match.",
    22: "The quota has been exceeded.",
    23: "The operation timed out.",
    24: "The supplied node is incorrect or has an incorrect ancestor for this operation.",
    25: "The object can not be cloned.",
    99: "The content of an object does not include valid values.",
    100: "Error occurred in communication with the underlying implementation that meant the requested method could not complete.",
    111: "Requested service is not available."
},
    errType = {
    0: "UnknownError",
    1: "IndexSizeError",
    2: "DOMStringSizeError",
    3: "HierarchyRequestError",
    4: "WrongDocumentError",
    5: "InvalidCharacterError",
    6: "NoDataAllowedError",
    7: "NoModificationAllowedError",
    8: "NotFoundError",
    9: "NotSupportedError",
    10: "InuseAttributeError",
    11: "InvalidStateError",
    12: "SyntaxError",
    13: "InvalidModificationError",
    14: "NamespaceError",
    15: "InvalidAccessError",
    16: "ValidationError",
    17: "TypeMismatchError",
    18: "SecurityError",
    19: "NetworkError",
    20: "AbortError",
    21: "URLMismatchError",
    22: "QuotaExceededError",
    23: "TimeoutError",
    24: "InvalidNodeTypeError",
    25: "DataCloneError",
    99: "InvalidValuesError",
    100: "IOError",
    111: "ServiceNotAvailableError"
};

/*
  support 3 types of error:
  - WebAPIError()
      code = errorcode.UNKNOWN_ERR
      message = errorcode.message[UNKNOWN_ERR]
  - WebAPIError(errorcode."TYPE_MISMATCH_ERR")
      code = 17
      message = errorcode.message[17]
  - WebAPIError(my_own_error_code, "This is my error message.")
      code = my_own_error_code(number)
      message = "This is my error message."
*/

module.exports = function (code, message, name) {
    var _code, _message, _name;

    if (typeof code !== 'number') {
        _code = errorcode.UNKNOWN_ERR;
        _message = msg[_code];
        _name = errType[_code];
    } else {
        _code = code;
        if (typeof message === 'string') {
            _message = message;
        } else {
            _message = msg[_code];
        }
        if (typeof name === 'string') {
            _name = name;
        } else {
            _name = errType[_code];
        }
    }

    this.__defineGetter__("code", function () {
        return _code;
    });
    this.__defineGetter__("message", function () {
        return _message;
    });
    this.__defineGetter__("name", function () {
        return _name;
    });
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/WebAPIException', function (require, exports, module) {
/*
 *  Copyright 2012 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var errorcode = require('ripple/platform/tizen/2.0/errorcode');

var msg = {
    0: "Generic Error",
    1: "Index or size is negative, or greater than the allowed value.",
    2: "Specified range of text does not fit into a DOMString.",
    3: "Node is inserted somewhere it doesn't belong.",
    4: "Node is used in a different document than the one that created it (that doesn't support it).",
    5: "An invalid or illegal character is specified.",
    6: "Data is specified for a Node which does not support data.",
    7: "An attempt is made to modify an object where modifications are not allowed.",
    8: "An attempt is made to reference a Node in a context where it does not exist.",
    9: "The implementation does not support the requested type of object or operation.",
    10: "An attempt is made to add an attribute that is already in use elsewhere.",
    11: "An attempt is made to use an object that is not, or is no longer, usable.",
    12: "An invalid or illegal string is specified.",
    13: "An attempt is made to modify the type of the underlying object.",
    14: "An attempt is made to create or change an object in a way which is incorrect with regard to namespaces.",
    15: "A parameter or an operation is not supported by the underlying object.",
    16: "A call to a method such as insertBefore or removeChild would make the Node invalid with respect to \"partial validity\", this exception would be raised and the operation would not be done.",
    17: "The type of an object is incompatible with the expected type of the parameter associated to the object.",
    18: "An attempt is made to perform an operation or access some data in a way that would be a security risk or a violation of the user agent's security policy.",
    19: "A network error occurs in synchronous requests.",
    20: "The abort error occurs in asynchronous requests by user prompt.",
    21: "The operation could not be completed because the URL does not match.",
    22: "The quota has been exceeded.",
    23: "The operation timed out.",
    24: "The supplied node is incorrect or has an incorrect ancestor for this operation.",
    25: "The object can not be cloned.",
    99: "The content of an object does not include valid values.",
    100: "Error occurred in communication with the underlying implementation that meant the requested method could not complete.",
    111: "Requested service is not available."
},
    errType = {
    0: "UnknownError",
    1: "IndexSizeError",
    2: "DOMStringSizeError",
    3: "HierarchyRequestError",
    4: "WrongDocumentError",
    5: "InvalidCharacterError",
    6: "NoDataAllowedError",
    7: "NoModificationAllowedError",
    8: "NotFoundError",
    9: "NotSupportedError",
    10: "InuseAttributeError",
    11: "InvalidStateError",
    12: "SyntaxError",
    13: "InvalidModificationError",
    14: "NamespaceError",
    15: "InvalidAccessError",
    16: "ValidationError",
    17: "TypeMismatchError",
    18: "SecurityError",
    19: "NetworkError",
    20: "AbortError",
    21: "URLMismatchError",
    22: "QuotaExceededError",
    23: "TimeoutError",
    24: "InvalidNodeTypeError",
    25: "DataCloneError",
    99: "InvalidValuesError",
    100: "IOError",
    111: "ServiceNotAvailableError"
};

/*
  support 3 types of error:
  - WebAPIError()
      code = errorcode.UNKNOWN_ERR
      message = errorcode.message[UNKNOWN_ERR]
  - WebAPIError(errorcode."TYPE_MISMATCH_ERR")
      code = 17
      message = errorcode.message[17]
  - WebAPIError(my_own_error_code, "This is my error message.")
      code = my_own_error_code(number)
      message = "This is my error message."
*/

module.exports = function (code, message, name) {
    var g, c, _code, _message, _name;

    for (c in errorcode) {
        g = errorcode.__lookupGetter__(c);
        if (g) {
            this.__defineGetter__(c, g);
        }
    }

    if (typeof code !== 'number') {
        _code = errorcode.UNKNOWN_ERR;
        _message = msg[_code];
        _name = errType[_code];
    } else {
        _code = code;
        if (typeof message === 'string') {
            _message = message;
        } else {
            _message = msg[_code];
        }
        if (typeof name === 'string') {
            _name = name;
        } else {
            _name = errType[_code];
        }
    }

    this.__defineGetter__("code", function () {
        return _code;
    });
    this.__defineGetter__("message", function () {
        return _message;
    });
    this.__defineGetter__("name", function () {
        return _name;
    });
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/tizen1_utils', function (require, exports, module) {
/*
 *  Copyright 2011 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var self,
    utils = require('ripple/utils'),
    errorcode = require('ripple/platform/tizen/2.0/errorcode'),
    WebAPIException = require('ripple/platform/tizen/2.0/WebAPIException');

self = module.exports = {
    _wac2_regexSanitize: function (regexString) {
        var escapePattern = /([^\\]|^)(%)/g, percentPattern = /\\%/g;
        return regexString.replace("^", "\\^")
                .replace("$", "\\$")
                .replace("(", "\\(")
                .replace(")", "\\)")
                .replace("<", "\\<")
                .replace("[", "\\[")
                .replace("{", "\\{")
                .replace(/\\([^%])/, "\\\\$1")    /* don't replace \\% */
                .replace("|", "\\|")
                .replace(">", "\\>")
                .replace(".", "\\.")
                .replace("*", "\\*")
                .replace("+", "\\+")
                .replace("?", "\\?")
                .replace(escapePattern, "$1.*")  /* replace % with .* */
                .replace(percentPattern, "%");   /* strip excape of % */
    },

    isValidDate: function (d) {
        if (Object.prototype.toString.call(d) !== "[object Date]")
            return false;
        return !isNaN(d.getTime());
    },
    isValidTZDate: function (d) {
        if (d &&  (d instanceof tizen.TZDate)) {
            return true;
        }
        return false;
    },
    isValidArray: function (a) {
        return (Object.prototype.toString.call(a) === "[object Array]");
    },

    matchOptionArrayString: function (src, attr, pattern) {
        /* src.obj[attr] is a StringArray */
        var _pattern, re, _stringMatch;
        _pattern = this._wac2_regexSanitize(pattern);
        re = new RegExp("^" + _pattern + "$", "i");

        _stringMatch = function (obj, index) {
            if (pattern.search(/^%*$/i) === 0)
                return true;
            if (obj[attr] === undefined || obj[attr] === null)
                return false;
            return obj[attr].some(function (f) {
                return f.search(re) !== -1;
            });
        };
        return utils.filter(src, _stringMatch);
    },

    matchAttributeBooleanFilter: function (src, attr, value) {
        // only support EXACTLY matchFlag
        var _booleanMatch, atr = attr.split(".");

        if (atr.length === 2) {
            _booleanMatch = function (obj, index) {
                if (!obj[atr[0]])
                    return false;

                return (obj[atr[0]][atr[1]] === value);
            };
        } else {
            _booleanMatch = function (obj, index) {
                return (obj[attr] === value);
            };
        }

        return utils.filter(src, _booleanMatch);
    },

    matchAttributeArrayFilter: function (src, attr, matchFlag, value) {
        var _re, _arrayMatch, atr = attr.split("."), _existMatch;

        if (atr.length === 2) {
            _existMatch = function (obj, index) {
                if (!obj[atr[0]])
                    return false;

                return (obj[atr[0]][atr[1]] !== undefined);
            };
        } else {
            _existMatch = function (obj, index) {
                return (obj[attr] !== undefined);
            };
        }

        if (value === undefined || value === null) {
            return utils.filter(src, _existMatch);
        }

        switch (matchFlag)
        {
        case "EXACTLY":
            _re = new RegExp("^" + value + "$");
            break;
        case "FULLSTRING":
            _re = new RegExp("^" + value + "$", "i");
            break;
        case "CONTAINS":
            _re = new RegExp(value, "i");
            break;
        case "STARTSWITH":
            _re = new RegExp("^" + value, "i");
            break;
        case "ENDSWITH":
            _re = new RegExp(value + "$", "i");
            break;
        case "EXISTS":
            return utils.filter(src, _existMatch);
        default:
            return [];
        }

        if (atr.length === 2) {
            _arrayMatch = function (obj, index) {
                if (!obj[atr[0]])
                    return false;

                return (obj[atr[0]][atr[1]] && obj[atr[0]][atr[1]].some(function (o) {
                    return (o.search(_re) !== -1);
                }));
            };
        } else {
            _arrayMatch = function (obj, index) {
                return (obj[attr] && obj[attr].some(function (o) {
                    return (o.search(_re) !== -1);
                }));
            };
        }

        return utils.filter(src, _arrayMatch);
    },

    matchAttributeRangeFilter: function (src, attr, low, high) {
        var _rangeMatch, atr = attr.split(".");

        if (atr.length === 2) {
            _rangeMatch = function (obj, index) {
                var matched = true;

                if (!obj[atr[0]])
                    return false;

                if (low !== null && low !== undefined) {
                    matched = (obj[atr[0]][atr[1]] >= low);
                }
                if (matched && (high !== null && high !== undefined)) {
                    matched = (obj[atr[0]][atr[1]] <= high);
                }
                return matched;
            };
        } else {
            _rangeMatch = function (obj, index) {
                var matched = true;

                if (low !== null && low !== undefined) {
                    matched = (obj[attr] >= low);
                }
                if (matched && (high !== null && high !== undefined)) {
                    matched = (obj[attr] <= high);
                }
                return matched;
            };
        }
        return utils.filter(src, _rangeMatch);
    },

    matchAttributeFilter: function (src, attr, matchFlag, value) {
        var _re, _stringMatch, atr = attr.split("."),
            _existMatch;

        if (atr.length === 2) {
            _existMatch = function (obj, index) {
                if (!obj[atr[0]])
                    return false;

                return (obj[atr[0]][atr[1]] !== undefined);
            };
        } else {
            _existMatch = function (obj, index) {
                return (obj[attr] !== undefined);
            };
        }

        if (value === undefined || value === null) {
            return utils.filter(src, _existMatch);
        }

        switch (matchFlag)
        {
        case "EXACTLY":
            _re = new RegExp("^" + value + "$");
            break;
        case "FULLSTRING":
            _re = new RegExp("^" + value + "$", "i");
            break;
        case "CONTAINS":
            _re = new RegExp(value, "i");
            break;
        case "STARTSWITH":
            _re = new RegExp("^" + value, "i");
            break;
        case "ENDSWITH":
            _re = new RegExp(value + "$", "i");
            break;
        case "EXISTS":
            return utils.filter(src, _existMatch);
        default:
            return [];
        }
        if (atr.length === 2) {
            _stringMatch = function (obj, index) {
                if (!obj[atr[0]])
                    return false;

                if (matchFlag === "EXACTLY") {
                    return (obj[atr[0]][atr[1]] === value);
                } else if (typeof obj[atr[0]][atr[1]] !== 'string') {
                    return false;
                }

                return (obj[atr[0]][atr[1]].search(_re) !== -1);
            };
        } else {
            _stringMatch = function (obj, index) {
                if (matchFlag === "EXACTLY") {
                    return (obj[attr] === value);
                } else if (typeof obj[attr] !== 'string') {
                    return false;
                }

                return (obj[attr].search(_re) !== -1);
            };
        }
        return utils.filter(src, _stringMatch);
    },

    matchOptionString: function (src, attr, pattern) {
        /* src.obj[attr] is a string */
        var _stringMatch, _pattern, _re;
        _pattern = this._wac2_regexSanitize(pattern);
        _re = new RegExp("^" + _pattern + "$", "mi");

        _stringMatch = function (obj, index) {
            return (obj[attr].search(_re) !== -1);
        };
        return utils.filter(src, _stringMatch);
    },

    matchOptionDate: function (src, attr, filterStart, filterEnd) {
        var _dateMatch;
        _dateMatch = function (obj, index) {
            var matched = true, valueDate = obj[attr];

            if (filterStart !== undefined && filterStart !== null) {
                matched = (valueDate.getTime() >= filterStart.getTime());
            }
            if (matched && (filterEnd !== undefined && filterEnd !== null)) {
                matched = (valueDate.getTime() <= filterEnd.getTime());
            }
            return matched;
        };
        return utils.filter(src, _dateMatch);
    },

    matchOptionShortArray: function (src, attr, filterArray) {
        /* src.obj[attr] is a short, filterArray is an array
           i.e. find status is [CONFRIMED or TENTATIVE] */
        var arraySome = function (obj, index) {
            return filterArray.some(function (f) {
                return f === obj[attr];
            });
        };
        return utils.filter(src, arraySome);
    },

    validateArgumentType: function (arg, argType, errorObj) {
        var invalidArg = false;

        switch (argType) {
        case "array":
            if (!arg instanceof Array) {
                invalidArg = true;
            }
            break;
        case "date":
            if (!arg instanceof Date) {
                invalidArg = true;
            }
            break;
        case "integer":
            if (typeof Number(arg) !== "number" || Number(arg) !== Math.floor(arg)) {
                invalidArg = true;
            }
            break;
        default:
            if (typeof arg !== argType) {
                invalidArg = true;
            }
            break;
        }

        if (invalidArg) {
            throw errorObj;
        }
    },

    validateCallbackType: function (successCallback, errorCallback) {
        if (successCallback) {
            this.validateArgumentType(successCallback, "function",
                new WebAPIException(errorcode.TYPE_MISMATCH_ERR));
        }
        if (errorCallback) {
            this.validateArgumentType(errorCallback, "function",
                new WebAPIException(errorcode.TYPE_MISMATCH_ERR));
        }
    },

    validateEqualArrays: function (arrayOne, arrayTwo) {
        var isEqual = false, i;

        if (Object.prototype.toString.call(arrayTwo) === "[object Array]" &&
            Object.prototype.toString.call(arrayTwo) === "[object Array]" &&
            arrayOne.length === arrayTwo.length) {
            isEqual = true;
            for (i in arrayOne) {
                if (arrayOne[i] !== arrayTwo[i]) {
                    isEqual = false;
                    break;
                }
            }
        }
        return isEqual;
    },

    validateTypeMismatch: function (onSuccess, onError, name, callback) {

        if (onSuccess === undefined || onSuccess === null) {
            throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
        }
        this.validateArgumentType(onSuccess, "function",
                                  new WebAPIException(errorcode.TYPE_MISMATCH_ERR));
        if (onError !== null && onError !== undefined) {
            this.validateArgumentType(onError, "function",
                                      new WebAPIException(errorcode.TYPE_MISMATCH_ERR));
        }

        return callback && callback();
    },

    isEmptyObject: function (obj) {
        var prop;

        for (prop in obj) {
            return false;
        }
        return true;
    },

    arrayComposite: function (mode, arrayA, arrayB) {
        var combinedArray = arrayA.concat(arrayB),
            intersectionArray = arrayA.filter(function (value) {
                if (utils.arrayContains(arrayB, value)) {
                    return true;
                }

                return false;
            });

        switch (mode) {
        case "AND":
        case "INTERSECTION":
            return intersectionArray;
        case "OR":
        case "UNION":
            return intersectionArray.concat(combinedArray.filter(function (value) {
                if (utils.arrayContains(intersectionArray, value)) {
                    return false;
                }

                return true;
            }));
        default:
            return undefined;
        }
    },

    isEqual: function (srcObj, aimObj) {
        var i;

        if (typeof srcObj !== typeof aimObj) {
            return false;
        }

        if (srcObj === null || srcObj === undefined || typeof srcObj === 'number' ||
            typeof srcObj === 'string' || typeof srcObj === 'boolean') {
            return srcObj === aimObj;
        }

        for (i in srcObj) {
            if (!aimObj.hasOwnProperty(i) || !self.isEqual(srcObj[i], aimObj[i])) {
                return false;
            }
        }

        return true;
    },

    query: function (objects, filter, sortMode, count, offset) {
        function isCompositeFilter(filter) {
            return (filter.type) ? true : false;
        }

        function isAttributeFilter(filter) {
            return (filter.matchFlag) ? true : false;
        }

        function getValue(obj, key) {
            var keys = key.split("."),
                value = obj[keys[0]],
                i;

            for (i = 1; i < keys.length; i++) {
                if (value[keys[i]]) {
                    value = value[keys[i]];
                }
            }

            return value;
        }

        function _filter(objects, filter) {
            var i, results, eachResult, filterFunc;

            if (isCompositeFilter(filter)) {
                for (i in filter.filters) {
                    eachResult = _filter(objects, filter.filters[i]);
                    results = (results === undefined) ? eachResult : self.arrayComposite(filter.type, results, eachResult);
                }
                return results;
            }

            if (isAttributeFilter(filter)) {
                for (i in objects) {
                    if (filter.attributeName in objects[i])
                        break;
                }
                filterFunc = self.isValidArray(objects[i][filter.attributeName]) ? self.matchAttributeArrayFilter : self.matchAttributeFilter;
                results = filterFunc(objects, filter.attributeName, filter.matchFlag, filter.matchValue);
            } else {
                results = self.matchAttributeRangeFilter(objects, filter.attributeName, filter.initialValue, filter.endValue);
            }

            return results;
        }

        function _sort(objects, sortMode) {
            objects.sort(function (a, b) {
                return (sortMode.order === "ASC") ?
                    (getValue(a, sortMode.attributeName) < getValue(b, sortMode.attributeName) ? -1 : 1):
                    (getValue(a, sortMode.attributeName) > getValue(b, sortMode.attributeName) ? -1 : 1);
            });

            return objects;
        }

        var res = objects;

        if (filter) {
            res = _filter(res, filter);
        }

        if (sortMode) {
            _sort(res, sortMode);
        }

        if (offset || count) {
            offset = (offset > 0) ? offset : 0;
            res = (count > 0) ? res.slice(offset, offset + count) : res.slice(offset);
        }

        return res;
    },

    copyString: function (str) {
        var newStr, charConvert = [], i;

        if (typeof str !== 'string') {
            return str;
        }
        for (i = 0; i < str.length; i++) {
            charConvert[i] = str.charAt(i);
        }
        newStr = charConvert.join("");

        return newStr;
    },

    copy: function (obj) {
        var i,
            newObj = jQuery.isArray(obj) ? [] : {};

        if (typeof obj === 'number' ||
            typeof obj === 'string' ||
            typeof obj === 'boolean' ||
            obj === null ||
            obj === undefined) {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj);
        }

        if (obj instanceof RegExp) {
            return new RegExp(obj);
        }

        for (i in obj) {
            if (obj.hasOwnProperty(i)) {
                if (obj.__lookupGetter__(i)) {
                    newObj.__defineGetter__(i, (function (key) {
                        return function () {
                            return self.copy(obj[key]);
                        };
                    }(i)));
                }
                else {
                    newObj[i] = self.copy(obj[i]);
                }
            }
        }

        return newObj;
    }
};
});
define.unordered = true;
define('ripple/platform/tizen/2.0/systeminfo', function (require, exports, module) {
/*
 *  Copyright 2013 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var deviceSettings = require('ripple/xwalkDeviceSettings'),
    db = require('ripple/db'),
    t = require('ripple/platform/tizen/2.0/typecast'),
    typedef = require('ripple/platform/tizen/2.0/typedef'),
    constants = require('ripple/constants'),
    event = require('ripple/event'),
    tizen_utils = require('ripple/platform/tizen/2.0/tizen1_utils'),
    errorcode = require('ripple/platform/tizen/2.0/errorcode'),
    WebAPIException = require('ripple/platform/tizen/2.0/WebAPIException'),
    SystemInfoDeviceCapability,
    _systemInfoProperties = typedef.SystemInfoPropertyId,
    _propertyMap = {}, // Object like: {"BATTERY": ["level", "isCharging"], ...}
    _batteryEvent = ["BatteryLevelChanged", "BatteryChargingChanged"],
    _watches = {},
    _firstCall_watches = {},
    _powerData = {},
    _systemInfoDeviceCapability = null,
    _security = {
        "http://tizen.org/privilege/system": ["SystemInfoSIM", "webApiVersion",
                "nativeApiVersion", "platformVersion"],
        "http://tizen.org/privilege/systemmanager": ["NetworkImei"]
    },
    _self;

function _prepareObj(obj, aspect, property, value) {
    if ((aspect === "CELLULAR_NETWORK") && (property === "imei")) {
        obj.__defineGetter__("imei", function () {
            if (!_security.NetworkImei) {
                throw new WebAPIException(errorcode.SECURITY_ERR);
            }
            return deviceSettings.retrieve("CELLULAR_NETWORK.imei");
        });
    } else {
        if (aspect === "WIFI_NETWORK" || aspect === "CELLULAR_NETWORK") {
            if (property === 'status') {
                if (value === true) {
                    value = "ON";
                } else {
                    value = "OFF";
                }
            }
        }
        obj.__defineGetter__(property, function () {
            return value;
        });
    }
}

function _getValue(aspect, successCallback) {
    var properties = [], value, index = 0, property, obj = {};

    if ((aspect === "SIM") && !_security.SystemInfoSIM) {
        throw new WebAPIException(errorcode.SECURITY_ERR);
    }

    if (aspect === "BATTERY") {
        successCallback(_powerData);
        return;
    }

    properties = _propertyMap[aspect];
    for (; index < properties.length; index++) {
        property = properties[index];
        value = deviceSettings.retrieve(aspect + "." + property);
        _prepareObj(obj, aspect, property, value);
    }

    if (aspect === "STORAGE") {
        obj.__defineGetter__("units", function () {
            return [obj];
        });
    }

    successCallback(obj);
}

function _initialize() {
    var aspectName, index, i, vol;

    for (index = 0; index < _systemInfoProperties.length; index++) {
        aspectName = _systemInfoProperties[index];
        _propertyMap[aspectName] = [];
        for (i in deviceSettings.retrieve(aspectName)) {
            _propertyMap[aspectName].push(i);
        }
    }

    _propertyMap.BATTERY.push("level");
    _propertyMap.BATTERY.push("isCharging");

    _powerData.__defineGetter__("isCharging", function () {
        return false;
    });

    vol = db.retrieve(constants.BATTERY.VOLUME) || 100.0;
    _powerData.__defineGetter__("level", function () {
        return Number((vol / 100.0).toFixed(4));
    });

    event.on("BatteryEvent", function (status) {
        _powerData.__defineGetter__("isCharging", function () {
            return status.charging;
        });
        _powerData.__defineGetter__("level", function () {
            return Number(status.level.toFixed(4));
        });
    });
}

function _isPropertyFound(property) {
    if (tizen_utils.isEmptyObject(_propertyMap)) {
        _initialize();
    }

    if (_propertyMap[property]) {
        return true;
    }

    return false;
}

function _delayGetValue(timeout, property, successCallback, errorCallback) {
    return window.setInterval(function () {
        _getValue(property, successCallback, errorCallback);
    }, timeout);
}

_self = function () {
    function getCapabilities() {
        if (_systemInfoDeviceCapability === null) {
            _systemInfoDeviceCapability = new SystemInfoDeviceCapability();
        }
        return _systemInfoDeviceCapability;
    }

    function getPropertyValue(property, successCallback, errorCallback) {
        t.SystemInfo("getPropertyValue", arguments);

        if (!_isPropertyFound(property)) {
            throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
        }

        window.setTimeout(function () {
            _getValue(property, successCallback, errorCallback);
        }, 1);
    }

    function addPropertyValueChangeListener(property, successCallback, options) {
        var WatchOBJ, watchId = Number(Math.uuid(8, 10)),
            _options = new Object(options), properties, prop, index = 0,
            deviceEventType, watchObj, firstCallWatchObj;

        t.SystemInfo("addPropertyValueChangeListener", arguments);

        if (!_isPropertyFound(property)) {
            throw new WebAPIException(errorcode.TYPE_MISMATCH_ERR);
        }

        WatchOBJ = function (deviceEventType, property, successCallback) {
            var obj = this;

            this.eventType = deviceEventType;
            this.onEvent = function (newValue) {
                if (obj.timeout) {
                    window.clearInterval(obj.intervalId);
                    obj.intervalId = window.setInterval(function () {
                        _getValue(property, successCallback, null);
                    }, obj.timeout);
                }

                if ((obj.highThreshold && (newValue < obj.highThreshold)) ||
                    (obj.lowThreshold && (newValue > obj.lowThreshold))) {
                    return;
                }

                _getValue(property, successCallback, null);
            };
        };

        // A listener will listen all the properties of one aspect, each of the property
        // will have an internal watchObj to record the information.
        _watches[watchId] = [];

        if (property === "BATTERY") {
            properties = _batteryEvent;
        } else {
            properties = _propertyMap[property];
        }

        for (; index < properties.length; index++) {
            prop = properties[index];
            if (property === "BATTERY") {
                deviceEventType = prop;
            } else {
                deviceEventType = deviceSettings.retrieve(property)[prop].event;
            }

            if (deviceEventType === undefined) continue;
            // These two items are needed when delete an event listener.
            watchObj = new WatchOBJ(deviceEventType, property, successCallback);

            if (options && _options.timeout) {
                watchObj.intervalId = _delayGetValue(_options.timeout, property,
                        successCallback, null);
            }

            if ((watchObj.eventType === "CpuLoadChanged") ||
                    (watchObj.eventType === "DisplayBrightnessChanged") ||
                    (watchObj.eventType === "BatteryLevelChanged")) {
                if (options && _options.highThreshold) {
                    watchObj.highThreshold = _options.highThreshold;
                }

                if (options && _options.lowThreshold) {
                    watchObj.lowThreshold = _options.lowThreshold;
                }
            }

            _watches[watchId].push(watchObj);
            if (watchObj.eventType) {
                event.on(watchObj.eventType, watchObj.onEvent);
            }
        }

        firstCallWatchObj = window.setTimeout(function () {
            _getValue(property, successCallback, null);
            delete _firstCall_watches[watchId];
        }, 1);

        _firstCall_watches[watchId] = firstCallWatchObj;

        return watchId;
    }

    function removePropertyValueChangeListener(listenerID) {
        var _handler = listenerID, index = 0, watchObjs = [], watchObj;

        t.SystemInfo("removePropertyValueChangeListener", arguments);

        if (!_watches[_handler]) {
            throw new WebAPIException(errorcode.INVALID_VALUES_ERR);
        }
        watchObjs = _watches[_handler];
        if (watchObjs) {
            for (; index < watchObjs.length; index++) {
                watchObj = watchObjs[index];
                event.deleteEventHandler(watchObj.eventType, watchObj.onEvent);
                if (watchObj.intervalId) {
                    window.clearInterval(watchObj.intervalId);
                }
            }
            delete _watches[_handler];
        }

        if (_firstCall_watches[_handler]) {
            window.clearTimeout(_firstCall_watches[_handler]);
            delete _firstCall_watches[_handler];
        }
    }

    function handleSubFeatures(subFeatures) {
        var i, subFeature;

        for (subFeature in subFeatures) {
            for (i in _security[subFeature]) {
                _security[_security[subFeature][i]] = true;
            }
        }
    }

    var systeminfo = {
        getCapabilities: getCapabilities,
        getPropertyValue: getPropertyValue,
        addPropertyValueChangeListener: addPropertyValueChangeListener,
        removePropertyValueChangeListener: removePropertyValueChangeListener,
        handleSubFeatures: handleSubFeatures
    };

    return systeminfo;
};

SystemInfoDeviceCapability = function () {
    this.__defineGetter__("bluetooth", function () {
        console.log("Xu:bluetooth()");
        return true;
    });
    this.__defineGetter__("nfc", function () {
        return true;
    });
    this.__defineGetter__("nfcReservedPush", function () {
        return false;
    });
    this.__defineGetter__("multiTouchCount", function () {
        return 5;
    });
    this.__defineGetter__("inputKeyboard", function () {
        return false;
    });
    this.__defineGetter__("inputKeyboardLayout", function () {
        return false;
    });
    this.__defineGetter__("wifi", function () {
        return true;
    });
    this.__defineGetter__("wifiDirect", function () {
        return true;
    });
    this.__defineGetter__("opengles", function () {
        return false;
    });
    this.__defineGetter__("openglestextureFormat", function () {
        return "";
    });
    this.__defineGetter__("openglesVersion1_1", function () {
        return false;
    });
    this.__defineGetter__("openglesVersion2_0", function () {
        return false;
    });
    this.__defineGetter__("fmRadio", function () {
        return false;
    });
    this.__defineGetter__("platformVersion", function () {
        if (!_security.platformVersion) {
            throw new WebAPIException(errorcode.SECURITY_ERR);
        }
        return "2.2.0";
    });
    this.__defineGetter__("webApiVersion", function () {
        if (!_security.webApiVersion) {
            throw new WebAPIException(errorcode.SECURITY_ERR);
        }
        return "2.2";
    });
    this.__defineGetter__("nativeApiVersion", function () {
        if (!_security.nativeApiVersion) {
            throw new WebAPIException(errorcode.SECURITY_ERR);
        }
        return "2.2";
    });
    this.__defineGetter__("platformName", function () {
        return "Tizen";
    });
    this.__defineGetter__("camera", function () {
        return false;
    });
    this.__defineGetter__("cameraFront", function () {
        return false;
    });
    this.__defineGetter__("cameraFrontFlash", function () {
        return false;
    });
    this.__defineGetter__("cameraBack", function () {
        return false;
    });
    this.__defineGetter__("cameraBackFlash", function () {
        return false;
    });
    this.__defineGetter__("location", function () {
        return true;
    });
    this.__defineGetter__("locationGps", function () {
        return true;
    });
    this.__defineGetter__("locationWps", function () {
        return false;
    });
    this.__defineGetter__("microphone", function () {
        return false;
    });
    this.__defineGetter__("usbHost", function () {
        return true;
    });
    this.__defineGetter__("usbAccessory", function () {
        return false;
    });
    this.__defineGetter__("screenOutputRca", function () {
        return false;
    });
    this.__defineGetter__("screenOutputHdmi", function () {
        return false;
    });
    this.__defineGetter__("platformCoreCpuArch", function () {
        return "x86";
    });
    this.__defineGetter__("platformCoreFpuArch", function () {
        return "ssse3";
    });
    this.__defineGetter__("sipVoip", function () {
        return false;
    });
    this.__defineGetter__("duid", function () {
        return "device unique ID";
    });
    this.__defineGetter__("speechRecognition", function () {
        return false;
    });
    this.__defineGetter__("speechSynthesis", function () {
        return false;
    });
    this.__defineGetter__("accelerometer", function () {
        return true;
    });
    this.__defineGetter__("accelerometerWakeup", function () {
        return false;
    });
    this.__defineGetter__("barometer", function () {
        return false;
    });
    this.__defineGetter__("barometerWakeup", function () {
        return false;
    });
    this.__defineGetter__("gyroscope", function () {
        return true;
    });
    this.__defineGetter__("gyroscopeWakeup", function () {
        return false;
    });
    this.__defineGetter__("magnetometer", function () {
        return false;
    });
    this.__defineGetter__("magnetometerWakeup", function () {
        return false;
    });
    this.__defineGetter__("photometer", function () {
        return false;
    });
    this.__defineGetter__("photometerWakeup", function () {
        return false;
    });
    this.__defineGetter__("proximity", function () {
        return false;
    });
    this.__defineGetter__("proximityWakeup", function () {
        return false;
    });
    this.__defineGetter__("tiltmeter", function () {
        return false;
    });
    this.__defineGetter__("tiltmeterWakeup", function () {
        return false;
    });
    this.__defineGetter__("dataEncryption", function () {
        return false;
    });
    this.__defineGetter__("graphicsAcceleration", function () {
        return false;
    });
    this.__defineGetter__("push", function () {
        return true;
    });
    this.__defineGetter__("telephony", function () {
        return true;
    });
    this.__defineGetter__("telephonyMms", function () {
        return true;
    });
    this.__defineGetter__("telephonySms", function () {
        return true;
    });
    this.__defineGetter__("screenSizeNormal", function () {
        return true;
    });
    this.__defineGetter__("screenSize480_800", function () {
        return true;
    });
    this.__defineGetter__("screenSize720_1280", function () {
        return true;
    });
    this.__defineGetter__("autoRotation", function () {
        return true;
    });
    this.__defineGetter__("shellAppWidget", function () {
        return false;
    });
    this.__defineGetter__("visionImageRecognition", function () {
        return false;
    });
    this.__defineGetter__("visionQrcodeGeneration", function () {
        return false;
    });
    this.__defineGetter__("visionQrcodeRecognition", function () {
        return false;
    });
    this.__defineGetter__("visionFaceRecognition", function () {
        return false;
    });
    this.__defineGetter__("secureElement", function () {
        return false;
    });
    this.__defineGetter__("nativeOspCompatible", function () {
        return false;
    });
    this.__defineGetter__("profile", function () {
        return "MOBILE_WEB";
    });
};

module.exports = _self;
});

var _db = require('ripple/db'),
_deviceSettings = require('ripple/xwalkDeviceSettings'),
_sysinfo = require('ripple/platform/tizen/2.0/systeminfo');
jWorkflow.order(_db.initialize, _db)
         .andThen(_deviceSettings.initialize, _deviceSettings)
         .start();
exports.__defineGetter__('systeminfo', function () {return _sysinfo();});
exports.__defineSetter__('systeminfo', function () { });
