# Private library
chatbox_private_sources = \
	chatbox-utils.c \
	chatbox-utils.h \
	$(NULL)

pkglib_LTLIBRARIES = libcoding_chatbox_private-1.0.la
libcoding_chatbox_private_1_0_la_SOURCES = \
	$(chatbox_private_sources) \
	$(NULL)
libcoding_chatbox_private_1_0_la_CFLAGS = $(CODING_CHATBOX_PRIVATE_CFLAGS)
libcoding_chatbox_private_1_0_la_LIBADD = $(CODING_CHATBOX_PRIVATE_LIBS)
libcoding_chatbox_private_1_0_la_LDFLAGS = -avoid-version

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

girdir = $(pkgdatadir)/gir-1.0
gir_DATA = $(INTROSPECTION_GIRS)

typelibdir = $(pkglibdir)/girepository-1.0
typelib_DATA = $(gir_DATA:.gir=.typelib)

if HAVE_INTROSPECTION

ChatboxPrivate-1.0.gir: $(chatbox_private_sources) libcoding_chatbox_private-1.0.la Makefile
ChatboxPrivate_1_0_gir_NAMESPACE = ChatboxPrivate
ChatboxPrivate_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0 Gtk-3.0 Gdk-3.0
ChatboxPrivate_1_0_gir_CFLAGS = $(INCLUDES) $(CODING_CHATBOX_PRIVATE_CFLAGS)
ChatboxPrivate_1_0_gir_LIBS = libcoding_chatbox_private-1.0.la
ChatboxPrivate_1_0_gir_FILES = $(libcoding_chatbox_private_1_0_la_SOURCES)
ChatboxPrivate_1_0_gir_SCANNERFLAGS = --symbol-prefix=chatbox --identifier-prefix=Chatbox
INTROSPECTION_GIRS += ChatboxPrivate-1.0.gir

CLEANFILES = \
	$(gir_DATA) \
	$(typelib_DATA) \
	$(NULL)

endif
