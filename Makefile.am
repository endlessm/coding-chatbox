# All javascript modules
all_js_files = \
	src/main.js \
	$(NULL)

# Resources
resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/src --generate-dependencies $(srcdir)/src/com.endlessm.Mission.Chatbox.src.gresource.xml)
app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir)/data --generate-dependencies $(srcdir)/data/com.endlessm.Mission.Chatbox.data.gresource.xml)


# Set EXTRA_DIST and CLEANFILES initially
AM_CONFIG_MACRO_DIR =
EXTRA_DIST = $(all_js_files) \
	src/com.endlessm.Mission.Chatbox.in \
	src/com.endlessm.Mission.Chatbox.src.gresource.xml \
	src/com.endlessm.Mission.Chatbox.data.gresource.xml \
	$(NULL)


data/com.endlessm.Mission.Chatbox.data.gresource: data/com.endlessm.Mission.Chatbox.data.gresource.xml $(app_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir)/data $<

src/com.endlessm.Mission.Chatbox.src.gresource: src/com.endlessm.Mission.Chatbox.src.gresource.xml $(resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir)/src $<


chatbox_resources = data/com.endlessm.Mission.Chatbox.data.gresource \
		    src/com.endlessm.Mission.Chatbox.src.gresource \
		    $(NULL)


src/com.endlessm.Mission.Chatbox: src/com.endlessm.Mission.Chatbox.in $(chatbox_resources)
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
bin_SCRIPTS = src/com.endlessm.Mission.Chatbox

# Distclean
CLEANFILES = src/com.endlessm.Mission.Chatbox \
	$(chatbox_resources) \
	$(NULL)

