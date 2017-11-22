FROM stefanscherer/node-windows:8.9.1-nanoserver

ENV REQPROC_PATH %USERPROFILE%\shippable\reqProc
RUN echo $REQPROC_PATH
RUN mkdir $REQPROC_PATH
RUN mkdir $REQPROC_BIN_PATH
ADD . $REQPROC_PATH
RUN cd $REQPROC_PATH && npm install

ENV EXEC_TEMPLATES_PATH  %USERPROFILE%\shippable\execTemplates
RUN mkdir $EXEC_TEMPLATES_PATH && \
    wget https://github.com/Shippable/execTemplates/archive/master.tar.gz -O %TMP%\execTemplates.tar.gz && \
    tar -xzvf /tmp/execTemplates.tar.gz -C $EXEC_TEMPLATES_PATH --strip-components=1 && \
    del %TMP%\execTemplates.tar.gz

ENV REQEXEC_PATH  %USERPROFILE%\shippable\reqExec
RUN mkdir -p $REQEXEC_PATH && \
    wget https://s3.amazonaws.com/shippable-artifacts/reqExec/{{%TAG%}}/reqExec-{{%TAG%}}-{{%ARCHITECTURE%}}-{{%OS%}}.tar.gz -O %TMP%\reqExec.tar.gz && \
    tar -xzvf  %TMP%\reqExec.tar.gz -C $REQEXEC_PATH && \
    del  %TMP%\reqExec.tar.gz

ENTRYPOINT ["$REQPROC_PATH\boot.sh"]
