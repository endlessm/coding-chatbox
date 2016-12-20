/*
 * chatbox-utils.h
 *
 * This is a small helper module to copy a file URI into the clipboard, since
 * Gtk.Clipboard.set_with_data is not exposed to GObject-Introspection.
 *
 */

#ifndef _CHATBOX_UTILS_H
#define _CHATBOX_UTILS_H

#include <gtk/gtk.h>

typedef void (*ChatboxUtilsPangoAttrListCallback)(PangoAttr *, gpointer);

void chatbox_utils_copy_file_to_clipboard (GtkWidget *widget, GFile *file);
void chatbox_utils_copy_text_to_clipboard (GtkWidget *widget, char *text);
void chatbox_utils_pango_attr_list_foreach (PangoAttrList *attrs,
                                            ChatboxUtilsPangoAttrListCallback func,
                                            gpointer user_data);

#endif
