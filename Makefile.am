# Resources
resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/src --sourcedir=$(builddir)/src --generate-dependencies $(srcdir)/src/com.endlessm.Coding.Chatbox.src.gresource.xml)
app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/data --sourcedir=$(builddir)/data --generate-dependencies $(srcdir)/data/com.endlessm.Coding.Chatbox.data.gresource.xml)

gdbus_codegen_built_sources = ChatboxService.c ChatboxService.h

resourcedir = $(pkgdatadir)
resource_DATA = data/com.endlessm.Coding.Chatbox.data.gresource \
		src/com.endlessm.Coding.Chatbox.src.gresource \
		$(NULL)

servicedir = $(datadir)/dbus-1/services
service_DATA = $(service_in_files:.service.in=.service)
service_in_files = \
	data/com.endlessm.Coding.Chatbox.service.in \
	$(NULL)

# Set EXTRA_DIST and CLEANFILES initially
EXTRA_DIST = \
	$(resource_files) \
	$(app_resource_files) \
	$(service_in_files) \
	src/com.endlessm.Coding.Chatbox.in \
	src/com.endlessm.Coding.Chatbox.src.gresource.xml \
	data/com.endlessm.Coding.Chatbox.data.gresource.xml \
	$(NULL)

data/com.endlessm.Coding.Chatbox.service: $(srcdir)/data/com.endlessm.Coding.Chatbox.service.in
	$(AM_V_GEN) mkdir -p data
	$(AM_V_GEN) sed -e "s|\@bindir\@|$(bindir)|" $< > $@

data/com.endlessm.Coding.Chatbox.data.gresource: $(srcdir)/data/com.endlessm.Coding.Chatbox.data.gresource.xml $(app_resource_files)
	$(AM_V_GEN) mkdir -p data
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir)/data $<

src/com.endlessm.Coding.Chatbox.src.gresource: $(srcdir)/src/com.endlessm.Coding.Chatbox.src.gresource.xml $(resource_files)
	$(AM_V_GEN) mkdir -p src
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir)/src $<

src/com.endlessm.Coding.Chatbox: $(srcdir)/src/com.endlessm.Coding.Chatbox.in $(chatbox_resources)
	$(AM_V_GEN) mkdir -p src
	$(AM_V_GEN) sed \
		-e "s|[@]GJS@|$(GJS)|g" \
		-e "s|[@]PACKAGE_VERSION@|$(PACKAGE_VERSION)|g" \
		-e "s|[@]prefix@|$(prefix)|g" \
		-e "s|[@]libdir@|$(libdir)|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		$< > $@
	chmod +x $@
	echo $(app_resource_files)

com.endlessm.Coding.Chatbox.service: com.endlessm.Coding.Chatbox.service.in
	$(AM_V_GEN) sed \
		-e "s|[@]bindir@|$(bindir)|g" \
		$< > $@

# GDBus-Codegen for Chatbox
ChatboxService.c: $(abs_top_srcdir)/com.endlessm.Coding.Chatbox.xml
	gdbus-codegen --generate-c-code ChatboxService --c-namespace ChatboxService --c-generate-object-manager --interface-prefix com.endlessm. $<

ChatboxService.h: ChatboxService.c

# Generate the ChatboxService GDBus Skeleton library
libcoding_chatbox_1_0_la_SOURCES = $(resources_built_sources) \
			        $(gdbus_codegen_built_sources) \
					$(NULL)
libcoding_chatbox_1_0_la_CFLAGS = @CODING_CHATBOX_CFLAGS@
libcoding_chatbox_1_0_la_LDFLAGS = @CODING_CHATBOX_LDFLAGS@
libcoding_chatbox_1_0_la_LIBADD = @CODING_CHATBOX_LIBS@

# All libraries
lib_LTLIBRARIES = libcoding_chatbox-1.0.la

# Header files to install
coding_chatboxincludedir = $(includedir)/coding-chatbox
nobase_coding_chatboxinclude_HEADERS = \
	ChatboxService.h

# Scripts to install
bin_SCRIPTS = src/com.endlessm.Coding.Chatbox

# D-BUS Services
dbusservicedir = $(datadir)/dbus-1/services
dbusservice_DATA = com.endlessm.Coding.Chatbox.service

# Distclean
CLEANFILES = \
	$(resource_DATA) \
	src/com.endlessm.Coding.Chatbox \
	$(NULL)

# GObject-Introspection support
include $(INTROSPECTION_MAKEFILE)
INTROSPECTION_GIRS = $(NULL)
INTROSPECTION_SCANNER_ARGS = --add-include-path=$(srcdir) --warn-all
INTROSPECTION_COMPILER_ARGS = --includedir=$(srcdir)

if HAVE_INTROSPECTION
introspection_sources = $(libcoding_chatbox_1_0_la_SOURCES)

ChatboxService-1.0.gir: libcoding_chatbox-1.0.la
ChatboxService_1_0_gir_INCLUDES = GObject-2.0 Gio-2.0
ChatboxService_1_0_gir_CFLAGS = $(INCLUDES)
ChatboxService_1_0_gir_LIBS = libcoding_chatbox-1.0.la
ChatboxService_1_0_gir_FILES = $(introspection_sources)
INTROSPECTION_GIRS += ChatboxService-1.0.gir

girdir = $(datadir)/gir-1.0
gir_DATA = $(INTROSPECTION_GIRS)

typelibdir = $(libdir)/girepository-1.0
typelib_DATA = $(INTROSPECTION_GIRS:.gir=.typelib)

CLEANFILES += $(gir_DATA) $(typelib_DATA)
endif

