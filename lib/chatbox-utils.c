/*
 * chatbox-utils.c
 *
 * This is a small helper module to copy a file URI into the clipboard, since
 * Gtk.Clipboard.set_with_data is not exposed to GObject-Introspection.
 *
 */

#include <assert.h>
#include <gio/gio.h>
#include <gtk/gtk.h>
#include <gdk/gdk.h>
#include <glib.h>

/* Values for GtkSelection-related "info" fields */
enum {
  SELECTION_TEXT = 0,
  SELECTION_URI
};

static void
copy_file_get_callback (GtkClipboard      *clipboard,
                        GtkSelectionData  *selection_data,
                        guint             info,
                        gpointer          data)
{
  GFile *file = data;

  if (info == SELECTION_URI) {
    char **uris = g_new0 (char *, 2);
    uris[0] = g_file_get_uri (file);
    gtk_selection_data_set_uris (selection_data, uris);
    g_strfreev (uris);
  } else {
    char *parse_name = g_file_get_parse_name (file);
    gtk_selection_data_set_text (selection_data, parse_name, -1);
    g_free (parse_name);
  }
}

static void
copy_file_clear_callback (GtkClipboard *clipboard,
                          gpointer     data)
{
  GFile *file = data;
  g_object_unref (file);
}

void
chatbox_utils_copy_text_to_clipboard (GtkWidget *widget,
                                      char      *text)
{
  GtkClipboard *clipboard = gtk_widget_get_clipboard (widget, GDK_SELECTION_CLIPBOARD);
  gtk_clipboard_set_text(clipboard, text, -1);
}

void
chatbox_utils_copy_file_to_clipboard (GtkWidget *widget,
                                      GFile     *file)
{
  GtkClipboard *clipboard;
  GtkTargetList *target_list;
  GtkTargetEntry *targets;
  int n_targets;

  clipboard = gtk_widget_get_clipboard (widget, GDK_SELECTION_CLIPBOARD);

  target_list = gtk_target_list_new (NULL, 0);
  gtk_target_list_add_text_targets (target_list, SELECTION_TEXT);
  gtk_target_list_add_uri_targets (target_list, SELECTION_URI);
  targets = gtk_target_table_new_from_list (target_list, &n_targets);
  gtk_target_list_unref (target_list);

  gtk_clipboard_set_with_data (clipboard, targets, n_targets,
                               copy_file_get_callback,
                               copy_file_clear_callback,
                               g_object_ref (file));

  gtk_target_table_free (targets, n_targets);
}
