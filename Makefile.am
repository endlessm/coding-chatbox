SUBDIRS = lib data/icons po

# Our Autoconf macros are kept in the m4/ directory
ACLOCAL_AMFLAGS = -I m4

# Resources
resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/src --sourcedir=$(builddir)/src --generate-dependencies $(srcdir)/src/com.endlessm.Coding.Chatbox.src.gresource.xml)
app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/data --sourcedir=$(builddir)/data --generate-dependencies $(srcdir)/data/com.endlessm.Coding.Chatbox.data.gresource.xml)

gdbus_codegen_built_sources = ChatboxService.c ChatboxService.h

resourcedir = $(pkgdatadir)
resource_DATA = \
	data/com.endlessm.Coding.Chatbox.data.gresource \
	src/com.endlessm.Coding.Chatbox.src.gresource \
	$(NULL)

applicationsdir = $(datadir)/applications
applications_DATA = data/com.endlessm.Coding.Chatbox.desktop

servicedir = $(datadir)/dbus-1/services
service_DATA = $(service_in_files:.service.in=.service)
service_in_files = \
	data/com.endlessm.Coding.Chatbox.service.in \
	$(NULL)

# Tests
javascript_tests = \
	tests/js/testTimestamps.js \
	$(NULL)

# All javascript files (used for linter)
all_js_files = \
	$(resource_files) \
	$(javascript_tests) \
	$(NULL)

# Set EXTRA_DIST and CLEANFILES initially
EXTRA_DIST = \
	$(resource_files) \
	$(javascript_tests) \
	$(app_resource_files) \
	$(service_in_files) \
	com.endlessm.Coding.Chatbox.xml \
	src/com.endlessm.Coding.Chatbox.in \
	src/com.endlessm.Coding.Chatbox.src.gresource.xml \
	data/com.endlessm.Coding.Chatbox.data.gresource.xml \
	data/com.endlessm.Coding.Chatbox.desktop \
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

# GDBus-Codegen for Chatbox
ChatboxService.c: $(srcdir)/com.endlessm.Coding.Chatbox.xml
	gdbus-codegen --generate-c-code ChatboxService --c-namespace ChatboxService --c-generate-object-manager --interface-prefix com.endlessm. $<

ChatboxService.h: ChatboxService.c

# Generate the ChatboxService GDBus Skeleton library
libcoding_chatbox_1_0_la_SOURCES = \
	$(resources_built_sources) \
	$(gdbus_codegen_built_sources) \
	$(NULL)
libcoding_chatbox_1_0_la_CFLAGS = $(CODING_CHATBOX_CFLAGS)
libcoding_chatbox_1_0_la_LIBADD = $(CODING_CHATBOX_LIBS)

# All libraries
lib_LTLIBRARIES = libcoding_chatbox-1.0.la

# Header files to install
coding_chatboxincludedir = $(includedir)/coding-chatbox
nobase_coding_chatboxinclude_HEADERS = \
	ChatboxService.h

# Scripts to install
bin_SCRIPTS = src/com.endlessm.Coding.Chatbox

# Distclean
CLEANFILES = \
	$(resource_DATA) \
	$(service_DATA) \
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

#  Run tests when running 'make check'
TESTS = \
	$(javascript_tests) \
	run_coverage.coverage \
	run_eslint.eslint \
	$(NULL)
LOG_COMPILER = gtester
AM_LOG_FLAGS = -k --verbose

TEST_EXTENSIONS = .js .coverage .eslint

JS_LOG_DRIVER = env AM_TAP_AWK='$(AWK)' $(SHELL) $(top_srcdir)/tap-driver.sh
JS_LOG_DRIVER_FLAGS = --comments
JS_LOG_COMPILER = jasmine
AM_JS_LOG_FLAGS = --tap --no-config @JASMINE_REPORT_ARGUMENT@

# Use locally built versions of ChatboxService-1.0.gir, JS modules, and
# libraries. We clobber GJS_PATH and include the js directory and the
# $(top_srcdir) for including test helper files.
# (May need to change to AM_TESTS_ENVIRONMENT in a later version of Automake)
TESTS_ENVIRONMENT = \
	export GJS_PATH="$(top_srcdir):$(top_srcdir)/src"; \
	export GI_TYPELIB_PATH="$(top_builddir)$${GI_TYPELIB_PATH:+:$$GI_TYPELIB_PATH}"; \
	export LD_LIBRARY_PATH="$(top_builddir)/.libs$${LD_LIBRARY_PATH:+:$$LD_LIBRARY_PATH}"; \
	export G_TEST_SRCDIR="$(abs_srcdir)/tests"; \
	export G_TEST_BUILDDIR="$(abs_builddir)/tests"; \
	export LC_ALL=C; \
	$(NULL)

# # # COVERAGE # # #

# Don't specify the resource:/// URIs here, because the tests load modules from
# the local directory, not from the GResource
EOS_JS_COVERAGE_FILES := $(patsubst $(srcdir)/%,%,$(wildcard $(srcdir)/src/*.js))

@EOS_COVERAGE_RULES@

AM_JS_LOG_FLAGS += @EOS_JS_COVERAGE_LOG_FLAGS@


# # # LINTING # # #
EOS_ESLINT_FILES := $(all_js_files)

@EOS_ESLINT_RULES@

