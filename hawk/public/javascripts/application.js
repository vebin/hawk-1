//======================================================================
//                        HA Web Konsole (Hawk)
// --------------------------------------------------------------------
//            A web-based GUI for managing and monitoring the
//          Pacemaker High-Availability cluster resource manager
//
// Copyright (c) 2009-2010 Novell Inc., Tim Serong <tserong@novell.com>
//                        All Rights Reserved.
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of version 2 of the GNU General Public License as
// published by the Free Software Foundation.
//
// This program is distributed in the hope that it would be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
//
// Further, this software is distributed without any warranty that it is
// free of the rightful claim of any third person regarding infringement
// or the like.  Any license provided herein, whether implied or
// otherwise, applies only to this software file.  Patent licenses, if
// any, provided herein do not apply to combinations of this program with
// other software, or any other product whatsoever.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write the Free Software Foundation,
// Inc., 59 Temple Place - Suite 330, Boston MA 02111-1307, USA.
//
//======================================================================

// Currently selected resource/node when menu is open
var activeItem = null;

var cib = null;
var cib_file = false;

function jq(id)
{
  return "#" + id.replace(/(:|\.)/g,'\\$1');
}


function expand_block(id)
{
  new Effect.BlindDown($(id+"::children"), { duration: 0.3, fps: 100 });
  $(id+"::children").removeClassName("closed");
  $(id+"::button").removeClassName("tri-closed").addClassName("tri-open");
}

function collapse_block(id)
{
  new Effect.BlindUp($(id+"::children"), { duration: 0.3, fps: 100 });
  $(id+"::children").addClassName("closed");
  $(id+"::button").removeClassName("tri-open").addClassName("tri-closed");
}

// TODO(should): for another approach to expand/contract, see
// http://www.kleenecode.net/2008/03/01/valid-and-accessible-collapsible-panels-with-scriptaculous/
function toggle_collapse(id)
{
  if ($(id+"::children").hasClassName("closed")) {
    expand_block(id);
  } else {
    collapse_block(id);
  }
}

function update_errors(errors)
{
  $j("#errorbar").html("");
  if (errors.size()) {
    $j("#errorbar").show();
    errors.each(function(e) {
      // TODO(must): is this escaped?
      $j("#errorbar").append($j('<div class="error">' + e.escapeHTML() + '</div>'));
    });
  } else {
    $j("#errorbar").hide();
  }
}

// need to pass parent in with open flag (e.g.: nodelist, reslist)
function update_panel(panel)
{
  $j(jq(panel.id)).attr("class", "ui-corner-all " + panel.className);
  $j(jq(panel.id+"::label")).html(panel.label);

  if (!panel.children) return false;

  var expand = panel.open ? true : false;   // do we really need to be this obscure?
  var c = $j(jq(panel.id+"::children")).children(":first");
  panel.children.each(function(item) {
    if (!c.length || c.attr("id") != item.id) {
      var d;
      if ($j(jq(item.id)).length) {
        // already got one for this resource, tear it out and reuse it.
        d = $j(jq(item.id)).detach();
      } else {
        // brand spanking new
        d = $j('<div id="' + item.id + '"/>');
        if (item.children) {
          // TODO(should): HTML-safe?
          d.html('<div class="clickable" onclick="toggle_collapse(\'' + item.id + '\');">' +
            '<div id="' + item.id + '::button" class="tri-' + (item.open ? 'open' : 'closed') + '"></div>' +
              '<a id="' + item.id + '::menu" class="menu-link"><img src="' + url_root + '/images/transparent-16x16.gif" class="action-icon" alt="" /></a>' +
              '<span id="' + item.id + '::label"></span></div>' +
            '<div id="' + item.id + '::children"' + (item.open ? '' : ' style="display: none;" class="closed"') + '</div>');
        } else {
          d.html('<a id="' + item.id + '::menu" class="menu-link"><img src="' + url_root + '/images/transparent-16x16.gif" class="action-icon" alt="" /></a><span id="' + item.id + '::label"></span>');
        }
      }
      if (!c.length) {
        $j(jq(panel.id+"::children")).append(d);
      } else {
        c.before(d);
      }
      if (!cib_file) {
        // Only add menus if this isn't a static test
        add_mgmt_menu($j(jq(item.id + "::menu")));
      }
    } else {
      c = c.next();
    }
    if (update_panel(item)) {
      if ($j(jq(item.id + "::children")).hasClass("closed")) {
        expand_block(item.attr("id"));
      }
      expand = true;
    }
  });
  // If there's any child nodes left, get rid of 'em
  while (c.length) {
    var nc = c.next();
    c.remove();
    c = nc;
  }
  return expand;
}

// Like string.split, but breaks on "::"
// TODO(could): think about changing our naming conventions so we don't need this.
function dc_split(str)
{
  parts = new Array();
  var s = 0;
  for (;;) {
    var e = str.indexOf("::", s);
    if (e == -1)
    {
      parts.push(str.substr(s));
      break;
    }
    parts.push(str.substr(s, e - s));
    s = e + 2;
  }
  return parts;
}

function popup_op_menu(e)
{
  // Hide everything first (otherwise it's actually possible to have
  // node and resource context menus visible simultaneously
  $j(jq("menu::node")).hide();
  $j(jq("menu::resource")).hide();

  var target = Event.element(e);
  var pos = target.cumulativeOffset();
  // parts[0] is "node" or "resource", parts[1] is op
  var parts = dc_split(target.parentNode.id);
  activeItem = parts[1];
  // Special case to show/hide migrate (only visible at top level, not children of groups)
  // TODO(should): in general we need a better way of understanding the cluster hierarchy
  // from here than walking the DOM tree - it's too dependant on too many things.
  if (parts[0] == "resource") {
    var c = 0;
    var isMs = false;
    var n = $j(target.parentNode);
    while (n && n.attr("id") != "reslist") {
      if (n.hasClass("res-primitive") || n.hasClass("res-clone") || n.hasClass("res-group")) {
        c++;
      }
      if (n.hasClass("res-ms")) {
        isMs = true;
      }
      n = n.parent();
    }
    if (c == 1) {
      // Top-level item (for primitive in group this would be 2)
      $j(jq("menu::resource::migrate")).show();
      $j(jq("menu::resource::unmigrate")).show();
    } else {
      $j(jq("menu::resource::migrate")).hide();
      $j(jq("menu::resource::unmigrate")).hide();
    }
    if (isMs) {
      $j(jq("menu::resource::promote")).show();
      $j(jq("menu::resource::demote")).show();
    } else {
      $j(jq("menu::resource::promote")).hide();
      $j(jq("menu::resource::demote")).hide();
    }
  }
  $j(jq("menu::" + parts[0])).css({left: pos.left+"px", top: pos.top+"px"}).show();
  Event.stop(e);
}

function menu_item_click(e)
{
  // parts[1] is "node" or "resource", parts[2] is op
  var parts = dc_split(Event.element(e).parentNode.id);
  $j("#dialog").html(GETTEXT[parts[1] + "_" + parts[2]](activeItem));
  // TODO(could): Is there a neater construct for this localized button thing?
  var b = {};
  b[GETTEXT.yes()]  = function() { perform_op(parts[1], activeItem, parts[2]); $j(this).dialog("close"); };
  b[GETTEXT.no()]   = function() { $j(this).dialog("close"); }
  $j("#dialog").dialog("option", {
    title:    Event.element(e).innerHTML,
    buttons:  b
  });
  $j("#dialog").dialog("open");
}

function menu_item_click_migrate(e)
{
  // parts[1] is "node" or "resource", parts[2] is op
  var parts = dc_split(Event.element(e).parentNode.id);
  var html = '<form><select id="migrate-to" size="4" style="width: 100%;">';
  // TODO(should): Again, too much dependence on DOM structure here
  $("nodelist::children").childElements().each(function(e) {
    var node = dc_split(e.id)[1];
    html += '<option value="' + node + '">' + GETTEXT.resource_migrate_to(node) + "</option>\n";
  });
  html += '<option selected="selected" value="">' + GETTEXT.resource_migrate_away() + "</option>\n";
  html += "</form></select>";
  $j("#dialog").html(html);
  // TODO(could): Is there a neater construct for this localized button thing?
  var b = {};
  b[GETTEXT.ok()] = function() {
    perform_op(parts[1], activeItem, parts[2], "node=" + $("migrate-to").getValue());
    $j(this).dialog("close");
  };
  b[GETTEXT.cancel()] = function() {
    $j(this).dialog("close");
  };
  $j("#dialog").dialog("option", {
    title:    GETTEXT[parts[1] + "_" + parts[2]](activeItem),
    buttons:  b
  });
  $j("#dialog").dialog("open");
}

function perform_op(type, id, op, extra)
{
  var state = "neutral";
  var c = $j(jq(type + "::" + id));
  if (c.hasClass("ns-active"))        state = "active";
  else if(c.hasClass("ns-inactive"))  state = "inactive";
  else if(c.hasClass("ns-error"))     state = "error";
  else if(c.hasClass("ns-transient")) state = "transient";
  else if(c.hasClass("rs-active"))    state = "active";
  else if(c.hasClass("rs-inactive"))  state = "inactive";
  else if(c.hasClass("rs-error"))     state = "error";
  $j(jq(type + "::" + id + "::menu")).children(":first").attr("src", url_root + "/images/spinner-16x16-" + state + ".gif");

  new Ajax.Request(url_root + "/main/" + type + "/" + op, {
    parameters: "format=json&" + type + "=" + id + (extra ? "&" + extra : ""),
    onSuccess:  function(request) {
      // Remove spinner (a spinner that stops too early is marginally better than one that never stops)
      $j(jq(type + "::" + id + "::menu")).children(":first").attr("src", url_root + "/images/icons/properties.png");
    },
    onFailure:  function(request) {
      // Remove spinner
      $j(jq(type + "::" + id + "::menu")).children(":first").attr("src", url_root + "/images/icons/properties.png");
      // Display error
      if (request.responseJSON) {
        error_dialog(request.responseJSON.error,
          request.responseJSON.stderr ? request.responseJSON.stderr : null);
      } else {
        if (request.status == 403) {
          // 403 == permission denied
          error_dialog(GETTEXT.err_denied());
        } else {
          error_dialog(GETTEXT.err_unexpected(request.status));
        }
      }
    }
  });
}

function add_mgmt_menu(e)
{
  switch (dc_split(e.attr("id"))[0]) {
    case "node":
      e.addClass("clickable");
      e.click(popup_op_menu);
      e.children(":first").attr("src", url_root + "/images/icons/properties.png");
      break;
    case "resource":
      if (e.parent().parent().hasClass("res-clone")) {
        e.addClass("clickable");
        e.click(popup_op_menu);
        e.children(":first").attr("src", url_root + "/images/icons/properties.png");
      } else {
        var isClone = false;
        var n = e.parent();
        while (n && n.attr("id") != "reslist") {
          if (n.hasClass("res-clone")) {
            isClone = true;
            break;
          }
          n = n.parent();
        }
        if (!isClone) {
          e.addClass("clickable");
          e.click(popup_op_menu);
          e.children(":first").attr("src", url_root + "/images/icons/properties.png");
        }
      }
      break;
  }
}

function init_menus()
{
  // TODO(should): re-evaluate use of 'first' here
  $j(jq("menu::node::standby")).first().click(menu_item_click);
  $j(jq("menu::node::online")).first().click(menu_item_click);
  $j(jq("menu::node::fence")).first().click(menu_item_click);
//  $j(jq("menu::node::mark")).first().click(menu_item_click);

  $j(jq("menu::resource::start")).first().click(menu_item_click);
  $j(jq("menu::resource::stop")).first().click(menu_item_click);
  $j(jq("menu::resource::migrate")).first().click(menu_item_click_migrate);
  $j(jq("menu::resource::unmigrate")).first().click(menu_item_click);
  $j(jq("menu::resource::promote")).first().click(menu_item_click);
  $j(jq("menu::resource::demote")).first().click(menu_item_click);
  $j(jq("menu::resource::cleanup")).first().click(menu_item_click);

  $j(document).click(function() {
    $j(jq("menu::node")).hide();
    $j(jq("menu::resource")).hide();
  });
}

function error_dialog(msg, body)
{
  if (body) {
    // TODO(should): theme this properly
    msg += '<div id="dialog-body" class="message">' + body.escapeHTML().replace(/\n/g, "<br />") + "</div>";
  }
  $j("#dialog").html(msg);
  // TODO(could): Is there a neater construct for this localized button thing?
  var b = {};
  b[GETTEXT.ok()]   = function() { $j(this).dialog("close"); }
  $j("#dialog").dialog("option", {
    title:    GETTEXT.error(),
    buttons:  b
  });
  $j("#dialog").dialog("open");
}

function do_update(cur_epoch)
{
  // No refresh if this is a static test
  if (cib_file) return;

  new Ajax.Request(url_root + "/monitor?" + cur_epoch, { method: "get",
    onSuccess: function(transport) {
      if (transport.responseJSON) {
        var new_epoch = transport.responseJSON ? transport.responseJSON.epoch : "";
        if (new_epoch != cur_epoch) {
          update_cib();
        } else {
          do_update(new_epoch);
        }
      } else {
        // This can occur when onSuccess is called erroneously
        // on network failure; re-request in 15 seconds
        setTimeout("do_update('" + cur_epoch + "')", 15000);
      }
    },
    onFailure: function(transport) {
      // Busted, retry in 15 seconds.
      setTimeout("do_update('" + cur_epoch + "')", 15000);
    }
  });
}

function cib_to_nodelist_panel(nodes)
{
  var panel = {
    id:         "nodelist",
    className:  "",
    style:      "",
    label:      GETTEXT.nodes_configured(nodes.size()),
    open:       false,
    children:   []
  };
  nodes.each(function(n) {
    var className;
    var label = GETTEXT.node_state_unknown();
    switch (n.state) {
      case "online":
        className = "active";
        label = GETTEXT.node_state_online();
        break;
      case "offline":
        className = "inactive";
        label = GETTEXT.node_state_offline();
        break;
      case "pending":
        className = "transient";
        label = GETTEXT.node_state_pending();
        break;
      case "standby":
        className = "inactive";
        label = GETTEXT.node_state_standby();
        break;
      case "unclean":
        className = "error";
        label = GETTEXT.node_state_unclean();
        break;
      default:
        // This can't happen
        className = "error";
        break;
    }
    if (n.state != "online") {
      panel.open = true;
    }
    panel.children.push({
      id:         "node::" + n.uname,
      className:  "node ns-" + className,
      label:      GETTEXT.node_state(n.uname, label),
      menu:       true
    });
  });
  return panel;
}

// TODO(must): sort order for injected instances might be wrong
function get_primitive(res)
{
  var set = [];
  for (var i in res.instances) {
    var id = res.id;
    if (i != "default") id += ":" + i;
    var status_class = "res-primitive";
    var label;
    var active = false;
    if (res.instances[i].master) {
      label = GETTEXT.resource_state_master(id, res.instances[i].master);
      status_class += " rs-active rs-master";
      active = true;
    } else if (res.instances[i].slave) {
      label = GETTEXT.resource_state_slave(id, res.instances[i].slave);
      status_class += " rs-active rs-slave";
      active = true;
    } else if (res.instances[i].started) {
      label = GETTEXT.resource_state_started(id, res.instances[i].started);
      status_class += " rs-active";
      active = true;
    } else if (res.instances[i].pending) {
      label = GETTEXT.resource_state_pending(id, res.instances[i].pending);
      status_class += " rs-transient";
    } else {
      label = GETTEXT.resource_state_stopped(id);
      status_class += " rs-inactive";
    }
    set.push({
      id:         "resource::" + id,
      instance:   i,
      className:  status_class,
      label:      label,
      active:     active
    });
  }
  return set;
}

function get_group(res)
{
  var instances = [];
  var groups = {};
  res.children.each(function(c) {
    var set = get_primitive(c);
    set.each(function(i) {
      if (!groups[i.instance]) {
        instances.push(i.instance);
        groups[i.instance] = {
          id:        "resource::" + res.id,
          className: "res-group rs-active",
          label:     GETTEXT.resource_group(res.id),
          open:      false,
          children:  []
        };
        if (i.instance != "default") {
          groups[i.instance].id += ":" + i.instance;
          groups[i.instance].label += ":" + i.instance;
        }
      }
      if (!i.active) {
        groups[i.instance].open = true;
        groups[i.instance].className = "res-group rs-inactive";
      }
      groups[i.instance].children.push(i);
    });
  });
  set = []
  instances.sort().each(function(i) {
    set.push(groups[i]);
  });
  return set;
}

function get_clone(res)
{
  var status_class = "rs-active";
  var children = [];
  var open = false;
  res.children.each(function(p) {
    if (p.type == "group") {
      var set = get_group(p);
      set.each(function(c) {
        if (c.open) open = true;
        if (c.className.indexOf("rs-active") == -1) status_class = "rs-inactive";
        children.push(c);
      });
    } else {
      var set = get_primitive(p);
      set.each(function(c) {
        if (!c.active) {
          open = true;
          status_class = "rs-inactive";
        }
        children.push(c);
      });
    }
  });
  if (res.type == "master") {
    status_class += " res-ms";
  }
  return {
    id:         "resource::" + res.id,
    className:  "res-clone " + status_class,
    label:      (res.type == "master" ? GETTEXT.resource_master(res.id) : GETTEXT.resource_clone(res.id)),
    open:       open,
    children:   children
  };
}

function cib_to_reslist_panel(resources)
{
  var panel = {
    id:         "reslist",
    className:  "",
    style:      "",
    label:      GETTEXT.resources_configured(resources.size()),
    open:       false,
    children:   []
  };
  resources.each(function(res) {
    var c = null;
    if (res.children) {
      if (res.type == "group") {
        c = get_group(res)[0];
        if (c.open) panel.open = true;
      } else if (res.type == "clone" || res.type == "master") {
        c = get_clone(res);
        if (c.open) panel.open = true;
      }
    } else {
      c = get_primitive(res)[0];
      if (!c.active) panel.open = true;
    }
    if (c) {
      panel.children.push(c);
    }
  });
  return panel;
}

function update_cib()
{
  new Ajax.Request(url_root + "/cib/" + (cib_file ? cib_file : "live"), { method: "get",
    parameters: "format=json" + (cib_file ? "&debug=file" : ""),
    onSuccess: function(transport) {
      $j("#onload-spinner").hide();
      if (transport.responseJSON) {
        cib = transport.responseJSON;
        update_errors(cib.errors);
        if (cib.meta) {
          $j("#summary").show();
          $j(jq("summary::dc")).html(cib.meta.dc);
          for (var e in cib.crm_config) {
            if (!$j(jq("summary::" + e))) continue;
            if (typeof(cib.crm_config[e]) == "boolean") {
              $j(jq("summary::" + e)).html(cib.crm_config[e] ? GETTEXT.yes() : GETTEXT.no())
            } else if(e == "dc_version") {
              $j(jq("summary::" + e)).html(cib.crm_config[e].match(/.*-[a-f0-9]{12}/).toString());
            } else {
              $j(jq("summary::" + e)).html(cib.crm_config[e].toString());
            }
          }

          $j("#nodelist").show();
          if (update_panel(cib_to_nodelist_panel(cib.nodes))) {
            if ($j(jq("nodelist::children")).hasClass("closed")) {
              expand_block("nodelist");
            }
          }

          $j("#reslist").show();
          if (update_panel(cib_to_reslist_panel(cib.resources))) {
            if ($j(jq("reslist::children")).hasClass("closed")) {
              expand_block("reslist");
            }
          }

        } else {
          // TODO(must): is it possible to get here with empty cib.errors?
          $j("#summary").hide();
          $j("#nodelist").hide();
          $j("#reslist").hide();
        }
      }
      do_update(cib.meta ? cib.meta.epoch : "");
    },
    onFailure: function(transport) {
      if (transport.status == 403) {
        // 403 == permission denied, boot the user out
        window.location.replace(url_root + "/logout?reason=forbidden");
      } else {
        if (transport.responseJSON && transport.responseJSON.errors) {
          // Sane response (server not dead, but actual error, e.g.:
          // access denied):
          update_errors(transport.responseJSON.errors);
        } else {
          // Unexpectedly busted (e.g.: server fried):
          update_errors([GETTEXT.err_unexpected(transport.status + " " + transport.statusText)]);
        }
        $j("#summary").hide();
        $j("#nodelist").hide();
        $j("#reslist").hide();
        if (cib_file) {
          $j("#onload-spinner").hide();
        } else {
          // Try again in 15 seconds.  No need for roundtrip through
          // the monitor function in this case (it'll just hammer the
          // server unnecessarily)
          setTimeout(update_cib, 15000);
        }
      }
    }
  });
}

function hawk_init()
{
  var q = $j.parseQuery();
  if (q.cib_file) {
    cib_file = q.cib_file;
  }

  init_menus();

  $j("#dialog").dialog({
    resizable:      false,
    width:          "30em",
    draggable:      false,
    modal:          true,
    autoOpen:       false,
    closeOnEscape:  true
  });

  // TOTHEME
  $j("#content").prepend($j(
    '<div id="summary" class="ui-widget-content ui-corner-all" style="display: none;">' +
      '<table>' +
        '<tr><th>' + GETTEXT.summary_stack() + '</th><td><span id="summary::cluster_infrastructure"></span></td></tr>' +
        '<tr><th>' + GETTEXT.summary_version() + '</th><td><span id="summary::dc_version"></span></td></tr>' +
        '<tr><th>' + GETTEXT.summary_dc() + '</th><td><span id="summary::dc"></span></td></tr>' +
        '<tr><td colspan="2" style="border-top: 1px solid #aaa;"></td></tr>' +
        '<tr><th>' + GETTEXT.summary_stickiness() + '</th><td><a href="../cib/live/crm_config/cib-bootstrap-options/edit"><img src="../images/icons/edit.png" class="action-icon" alt="' + GETTEXT.configure() + '" title="' + GETTEXT.configure() + '" style="float: right;" /></a><span id="summary::default_resource_stickiness"></span></td></tr>' +
        '<tr><th>' + GETTEXT.summary_stonith_enabled() + '</th><td><span id="summary::stonith_enabled"></span></td></tr>' +
        '<tr><th>' + GETTEXT.summary_symmetric() + '</th><td><span id="summary::symmetric_cluster"></span></td></tr>' +
        '<tr><th>' + GETTEXT.summary_no_quorum_policy() + '</th><td><span id="summary::no_quorum_policy"></span></td></tr>' +
      '</table>' +
    '</div>' +
    '<div id="nodelist" class="ui-corner-all" style="display: none;">' +
      '<div class="clickable" onclick="toggle_collapse(\'nodelist\');"><div id="nodelist::button" class="tri-closed"></div><a id="nodelist::menu" class="menu-link"><img src="' + url_root + '/images/transparent-16x16.gif" class="action-icon" alt="" /></a><span id="nodelist::label"></span></div>' +
      '<div id="nodelist::children" style="display: none;" class="closed"></div>' +
    '</div>' +
    '<div id="reslist" class="ui-corner-all" style="display: none;">' +
      '<div class="clickable" onclick="toggle_collapse(\'reslist\');"><div id="reslist::button" class="tri-closed"></div><a id="reslist::menu" class="menu-link"><img src="' + url_root + '/images/transparent-16x16.gif" class="action-icon" alt="" /></a><span id="reslist::label"></span></div>' +
      '<div id="reslist::children" style="display: none;" class="closed"></div>' +
    '</div>'));

  update_cib();
}
