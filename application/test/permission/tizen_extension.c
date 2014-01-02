// Copyright (c) 2013 Intel Corporation. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#if defined(__cplusplus)
#error "This file is written in C to make sure the C API works as intended."
#endif

#include <stdio.h>
#include <stdlib.h>
#include "public/XW_Extension.h"
#include "public/XW_Extension_SyncMessage.h"
#include "public/XW_Extension_Permissions.h"

XW_Extension g_extension = 0;
const XW_CoreInterface* g_core = NULL;
const XW_MessagingInterface* g_messaging = NULL;
const XW_Internal_SyncMessagingInterface* g_sync_messaging = NULL;
const XW_Internal_PermissionsInterface* g_permission = NULL;

void instance_created(XW_Instance instance) {
  printf("Instance %d created!\n", instance);
}

void instance_destroyed(XW_Instance instance) {
  printf("Instance %d destroyed!\n", instance);
}

void handle_message(XW_Instance instance, const char* message) {
  int result;
  printf("Xu:enter handle_message():received message: %s\n", message);
  if (g_permission) 
      g_permission->CheckAPIAccessControl(g_extension, "echo");
  g_messaging->PostMessage(instance, message);
  printf("Xu:leave handle_message()\n");
}

void handle_sync_message(XW_Instance instance, const char* message) {
  int result;
  printf("Xu:enter handle_sync_message\n");
  result = g_permission->CheckAPIAccessControl(g_extension, "syncEcho");
  printf("Xu: in handle_sync_messag: result is %d\n", result);
  g_sync_messaging->SetSyncReply(instance, message);
  printf("Xu:leave handle_sync_message\n");
}

void shutdown(XW_Extension extension) {
  printf("Shutdown\n");
}

int32_t XW_Initialize(XW_Extension extension, XW_GetInterface get_interface) {
  static const char* kAPI =
      "var echoListener = null;"
      "extension.setMessageListener(function(msg) {"
      "  if (echoListener instanceof Function) {"
      "    echoListener(msg);"
      "  };"
      "});"
      "exports.echo = function(msg, callback) {"
      "  echoListener = callback;"
      "  extension.postMessage(msg);"
      "};"
      "exports.syncEcho = function(msg) {"
      "  console.log('Xu:in syncEcho JS part: ', msg);"
      "  return extension.internal.sendSyncMessage(msg);"
      "};";

  g_extension = extension;
  g_core = get_interface(XW_CORE_INTERFACE);
  g_core->SetExtensionName(extension, "echo");
  g_core->SetJavaScriptAPI(extension, kAPI);
  g_core->RegisterInstanceCallbacks(
      extension, instance_created, instance_destroyed);
  g_core->RegisterShutdownCallback(extension, shutdown);
  printf("XU:*\n");
  g_messaging = get_interface(XW_MESSAGING_INTERFACE);
  g_messaging->Register(extension, handle_message);

  g_sync_messaging = get_interface(XW_INTERNAL_SYNC_MESSAGING_INTERFACE);
  g_sync_messaging->Register(extension, handle_sync_message);

  g_permission = get_interface(XW_INTERNAL_PERMISSIONS_INTERFACE);
  printf("XU:**\n");
  return XW_OK;
}
