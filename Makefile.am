# Resources
resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/src --sourcedir=$(builddir)/src --generate-dependencies $(srcdir)/src/com.endlessm.Coding.Chatbox.src.gresource.xml)
app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/data --sourcedir=$(builddir)/data --generate-dependencies $(srcdir)/data/com.endlessm.Coding.Chatbox.data.gresource.xml)

resourcedir = $(pkgdatadir)
resource_DATA = data/com.endlessm.Coding.Chatbox.data.gresource \
		src/com.endlessm.Coding.Chatbox.src.gresource \
		$(NULL)

# Set EXTRA_DIST and CLEANFILES initially
EXTRA_DIST = \
	$(resource_files) \
	$(app_resource_files) \
	src/com.endlessm.Coding.Chatbox.in \
	src/com.endlessm.Coding.Chatbox.src.gresource.xml \
	data/com.endlessm.Coding.Chatbox.data.gresource.xml \
	$(NULL)


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

# Scripts to install
bin_SCRIPTS = src/com.endlessm.Coding.Chatbox

# Distclean
CLEANFILES = \
	$(resource_DATA) \
	src/com.endlessm.Coding.Chatbox \
	$(NULL)

